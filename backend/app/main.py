from time import perf_counter
from uuid import UUID, uuid4
from typing import Optional

from fastapi import Depends, FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from .auth import (
    AuthConfigError,
    AuthenticationError,
    check_supabase_health,
    get_session,
    require_current_user,
    require_current_user_allow_deleted,
)
from .categories import list_categories
from .jobs import bootstrap_ingest_worker, enqueue_ingest_job
from .monitoring import capture_backend_exception, init_monitoring
from .pipeline import normalize_url
from .rate_limit import RateLimitExceededError, RateLimitRule, get_client_ip, rate_limiter
from .repositories import AuditLogsRepository, DocumentsRepository, IngestJobsRepository, UsersRepository
from .serializers import map_user_response
from .settings import settings
from .types import DocumentsListQuery, IngestListQuery, IngestRequest, PatchDocumentRequest, PatchMeRequest

app = FastAPI()
REQUEST_ID_HEADER = "X-Request-Id"
INGEST_RATE_LIMIT_RULE = RateLimitRule(
    name="ingest_create",
    limit=settings.ingest_rate_limit_count,
    window_seconds=settings.ingest_rate_limit_window_seconds,
)
MUTATION_RATE_LIMIT_RULE = RateLimitRule(
    name="mutation",
    limit=settings.mutation_rate_limit_count,
    window_seconds=settings.mutation_rate_limit_window_seconds,
)


def error_response(code: str, message: str, retryable: bool, extra: Optional[dict] = None) -> dict:
    payload = {
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
        }
    }
    if extra:
        payload.update(extra)
    return payload


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def response_with_request_id(response: Response, request_id: str) -> Response:
    if request_id:
        response.headers[REQUEST_ID_HEADER] = request_id
    return response


def log_request(message: str) -> None:
    print(message)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = (request.headers.get(REQUEST_ID_HEADER) or "").strip() or str(uuid4())
    request.state.request_id = request_id
    started_at = perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        log_request(
            f"[request_id={request_id}] {request.method} {request.url.path} -> unhandled_exception ({duration_ms}ms)"
        )
        raise

    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    response.headers[REQUEST_ID_HEADER] = request_id
    log_request(f"[request_id={request_id}] {request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)")
    return response


def map_job_response(job: dict) -> dict:
    return {
        "id": job["id"],
        "request_id": job["request_id"],
        "raw_url": job["raw_url"],
        "normalized_url": job["normalized_url"],
        "status": job["status"],
        "attempt": job["attempt"],
        "max_attempts": job["max_attempts"],
        "error_code": job["error_code"],
        "error_message": job["error_message"],
        "document_id": job["document_id"],
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "started_at": job["started_at"],
        "finished_at": job["finished_at"],
    }


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    only_query_errors = bool(exc.errors()) and all(
        len(issue.get("loc", [])) > 0 and issue["loc"][0] == "query" for issue in exc.errors()
    )
    message = "Invalid query" if only_query_errors else "Invalid request body"
    response = JSONResponse(
        status_code=400,
        content=error_response(
            "INVALID_REQUEST_BODY",
            message,
            False,
            {"issues": exc.errors(), "request_id": get_request_id(request)},
        ),
    )
    return response_with_request_id(response, get_request_id(request))


@app.exception_handler(ValidationError)
async def pydantic_validation_exception_handler(request: Request, exc: ValidationError):
    response = JSONResponse(
        status_code=400,
        content=error_response(
            "INVALID_REQUEST_BODY",
            "Invalid request body",
            False,
            {"issues": exc.errors(), "request_id": get_request_id(request)},
        ),
    )
    return response_with_request_id(response, get_request_id(request))


@app.exception_handler(AuthenticationError)
async def auth_exception_handler(request: Request, exc: AuthenticationError):
    response = JSONResponse(
        status_code=exc.status_code,
        content=error_response(
            exc.code,
            exc.message,
            exc.retryable,
            {"request_id": get_request_id(request)},
        ),
    )
    return response_with_request_id(response, get_request_id(request))


@app.exception_handler(AuthConfigError)
async def auth_config_exception_handler(request: Request, exc: AuthConfigError):
    response = JSONResponse(
        status_code=503,
        content=error_response(
            "AUTH_NOT_CONFIGURED",
            str(exc) or "Auth is not configured",
            False,
            {"request_id": get_request_id(request)},
        ),
    )
    return response_with_request_id(response, get_request_id(request))


@app.exception_handler(RateLimitExceededError)
async def rate_limit_exception_handler(request: Request, exc: RateLimitExceededError):
    response = JSONResponse(
        status_code=429,
        content=error_response(
            "RATE_LIMIT_EXCEEDED",
            f"Too many requests for {exc.rule.name}. Please try again later.",
            True,
            {
                "request_id": get_request_id(request),
                "retry_after_seconds": exc.retry_after_seconds,
                "limit": exc.rule.limit,
                "window_seconds": exc.rule.window_seconds,
            },
        ),
    )
    response.headers["Retry-After"] = str(exc.retry_after_seconds)
    return response_with_request_id(response, get_request_id(request))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = get_request_id(request)
    log_request(f"[request_id={request_id}] unhandled exception: {type(exc).__name__}: {exc}")
    capture_backend_exception(exc, request_id=request_id)
    response = JSONResponse(
        status_code=500,
        content=error_response(
            "INTERNAL_ERROR",
            str(exc) or "Internal server error",
            False,
            {"request_id": request_id},
        ),
    )
    return response_with_request_id(response, request_id)


@app.on_event("startup")
async def startup_event():
    init_monitoring()
    boot = await bootstrap_ingest_worker()
    if boot["recoveredRunning"] or boot["queued"]:
        print(
            f"ingest worker bootstrapped: recoveredRunning={boot['recoveredRunning']}, queued={boot['queued']}"
        )
    print(f"archive-url API listening on port {settings.port}")


@app.get("/health")
async def health():
    try:
        from .postgres.health import get_postgres_health

        postgres = get_postgres_health()
    except ModuleNotFoundError as error:
        postgres = {
            "configured": "unknown",
            "status": "missing_dependency",
            "message": str(error),
        }

    auth = await check_supabase_health()

    return {
        "status": "ok",
        "sqlite": {"status": "ok"},
        "postgres": postgres,
        "auth": auth,
    }


@app.get("/me")
async def get_me(current_user=Depends(require_current_user), session: Session = Depends(get_session)):
    repo = UsersRepository(session)
    user = repo.get_by_id(current_user.id)
    if user is None:
        return JSONResponse(status_code=404, content=error_response("USER_NOT_FOUND", "User not found", False))
    return {"user": map_user_response(user)}


@app.patch("/me")
async def patch_me(
    request: Request,
    body: PatchMeRequest,
    current_user=Depends(require_current_user),
    session: Session = Depends(get_session),
):
    rate_limiter.hit(key=f"{get_client_ip(request)}:{current_user.id}", rule=MUTATION_RATE_LIMIT_RULE)
    repo = UsersRepository(session)
    user = repo.get_by_id(current_user.id)
    if user is None:
        return JSONResponse(status_code=404, content=error_response("USER_NOT_FOUND", "User not found", False))
    repo.update_profile(user, display_name=body.display_name)
    AuditLogsRepository(session).create_log(
        action="user.profile_updated",
        entity_type="user",
        entity_id=str(user.id),
        user_id=UUID(current_user.id),
        payload={
            "display_name": body.display_name,
            "request_id": get_request_id(request),
        },
    )
    session.commit()
    session.refresh(user)
    return {"user": map_user_response(user)}


@app.delete("/me")
async def delete_me(request: Request, current_user=Depends(require_current_user), session: Session = Depends(get_session)):
    rate_limiter.hit(key=f"{get_client_ip(request)}:{current_user.id}", rule=MUTATION_RATE_LIMIT_RULE)
    repo = UsersRepository(session)
    user = repo.get_by_id(current_user.id)
    if user is None:
        return JSONResponse(status_code=404, content=error_response("USER_NOT_FOUND", "User not found", False))
    repo.mark_deleted(user)
    AuditLogsRepository(session).create_log(
        action="user.deleted",
        entity_type="user",
        entity_id=str(user.id),
        user_id=UUID(current_user.id),
        payload={"request_id": get_request_id(request)},
    )
    session.commit()
    return {
        "result": {
            "status": "scheduled",
            "message": "Account deletion scheduled",
        }
    }


@app.post("/me/reactivate")
async def reactivate_me(
    request: Request,
    current_user=Depends(require_current_user_allow_deleted),
    session: Session = Depends(get_session),
):
    rate_limiter.hit(key=f"{get_client_ip(request)}:{current_user.id}", rule=MUTATION_RATE_LIMIT_RULE)
    repo = UsersRepository(session)
    user = repo.get_by_id(current_user.id)
    if user is None:
        return JSONResponse(status_code=404, content=error_response("USER_NOT_FOUND", "User not found", False))
    if user.status == "disabled":
        return JSONResponse(status_code=403, content=error_response("ACCOUNT_DISABLED", "Account disabled", False))
    repo.reactivate(user)
    AuditLogsRepository(session).create_log(
        action="user.reactivated",
        entity_type="user",
        entity_id=str(user.id),
        user_id=UUID(current_user.id),
        payload={"request_id": get_request_id(request)},
    )
    session.commit()
    session.refresh(user)
    return {"user": map_user_response(user)}


@app.post("/ingest")
async def ingest(
    request: Request,
    body: IngestRequest,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    current_user=Depends(require_current_user),
    session: Session = Depends(get_session),
):
    rate_limiter.hit(key=f"{get_client_ip(request)}:{current_user.id}", rule=INGEST_RATE_LIMIT_RULE)
    try:
        normalized_url = normalize_url(str(body.url))
        idempotency_key_trimmed = (idempotency_key or "").strip()
        user_id = UUID(current_user.id)
        repo = IngestJobsRepository(session)

        if idempotency_key_trimmed:
            existing = repo.get_ingest_job_by_idempotency_key(user_id, idempotency_key_trimmed, normalized_url)
            if existing:
                return JSONResponse(
                    status_code=202,
                    content={
                        "job": map_job_response(existing),
                        "links": {
                            "self": f"/ingest-jobs/{existing['id']}",
                            "document": f"/documents/{existing['document_id']}" if existing["document_id"] else None,
                        },
                    },
                )

        existing_running = repo.get_running_ingest_job_by_normalized_url(user_id, normalized_url)
        if existing_running:
            return JSONResponse(
                status_code=202,
                content={
                    "job": map_job_response(existing_running),
                    "links": {
                        "self": f"/ingest-jobs/{existing_running['id']}",
                        "document": (
                            f"/documents/{existing_running['document_id']}" if existing_running["document_id"] else None
                        ),
                    },
                },
            )

        job = repo.create_ingest_job(
            user_id,
            {
                "request_id": str(uuid4()),
                "idempotency_key": idempotency_key_trimmed or None,
                "raw_url": str(body.url),
                "normalized_url": normalized_url,
                "description": body.description.strip() if body.description else None,
                "max_attempts": 2,
            }
        )
        AuditLogsRepository(session).create_log(
            action="ingest.created",
            entity_type="ingest_job",
            entity_id=str(job["id"]),
            user_id=user_id,
            payload={
                "request_id": get_request_id(request),
                "raw_url": str(body.url),
                "normalized_url": normalized_url,
                "idempotency_key": idempotency_key_trimmed or None,
            },
        )
        session.commit()

        await enqueue_ingest_job(job["id"])

        return JSONResponse(
            status_code=202,
            content={
                "job": map_job_response(job),
                "links": {
                    "self": f"/ingest-jobs/{job['id']}",
                    "document": None,
                },
            },
        )
    except Exception as error:  # noqa: BLE001
        message = str(error) or "Unknown error"
        is_invalid_url = "invalid url" in message.lower()
        return JSONResponse(
            status_code=400 if is_invalid_url else 500,
            content=error_response("INVALID_URL" if is_invalid_url else "INTERNAL_ERROR", message, False),
        )


@app.get("/ingest-jobs/{job_id}")
async def get_ingest_job(job_id: int, current_user=Depends(require_current_user), session: Session = Depends(get_session)):
    if job_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    job = IngestJobsRepository(session).get_ingest_job_by_id(UUID(current_user.id), job_id)
    if not job:
        return JSONResponse(status_code=404, content=error_response("JOB_NOT_FOUND", "Job not found", False))

    return {
        "job": map_job_response(job),
        "links": {
            "document": f"/documents/{job['document_id']}" if job["document_id"] else None,
        },
    }


@app.get("/ingest-jobs")
async def list_ingest_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    current_user=Depends(require_current_user),
    session: Session = Depends(get_session),
):
    try:
        parsed = IngestListQuery(limit=limit, status=status)
    except ValidationError as exc:
        return JSONResponse(
            status_code=400,
            content=error_response("INVALID_REQUEST_BODY", "Invalid query", False, {"issues": exc.errors()}),
        )
    items = IngestJobsRepository(session).list_ingest_jobs(UUID(current_user.id), parsed.limit, parsed.status)
    return {
        "items": [
            {
                "id": job["id"],
                "status": job["status"],
                "normalized_url": job["normalized_url"],
                "document_id": job["document_id"],
                "error_code": job["error_code"],
                "error_message": job["error_message"],
                "updated_at": job["updated_at"],
            }
            for job in items
        ]
    }


@app.get("/documents")
async def list_documents(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user=Depends(require_current_user),
    session: Session = Depends(get_session),
):
    try:
        parsed = DocumentsListQuery(limit=limit, offset=offset)
    except ValidationError as exc:
        return JSONResponse(
            status_code=400,
            content=error_response("INVALID_REQUEST_BODY", "Invalid query", False, {"issues": exc.errors()}),
        )
    repo = DocumentsRepository(session)
    return {
        "items": repo.list_documents(UUID(current_user.id), parsed.limit, parsed.offset),
        "total": repo.count_documents(UUID(current_user.id)),
    }


@app.get("/categories")
async def get_categories():
    return {"items": list_categories()}


@app.get("/documents/{doc_id}")
async def get_document(doc_id: int, current_user=Depends(require_current_user), session: Session = Depends(get_session)):
    if doc_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    row = DocumentsRepository(session).get_document_by_id(UUID(current_user.id), doc_id)
    if not row:
        return JSONResponse(status_code=404, content=error_response("DOCUMENT_NOT_FOUND", "Document not found", False))
    return {"document": row}


@app.patch("/documents/{doc_id}")
async def patch_document(
    request: Request,
    doc_id: int,
    body: PatchDocumentRequest,
    current_user=Depends(require_current_user),
    session: Session = Depends(get_session),
):
    rate_limiter.hit(key=f"{get_client_ip(request)}:{current_user.id}", rule=MUTATION_RATE_LIMIT_RULE)
    if doc_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    updated = DocumentsRepository(session).update_document_by_id(
        UUID(current_user.id),
        doc_id,
        {
            "title": body.title,
            "description": body.description,
            "category_key": body.category_key,
            "links": [link.model_dump(mode="json") for link in body.links] if body.links is not None else None,
            "is_pinned": body.is_pinned,
        },
    )
    if not updated:
        return JSONResponse(status_code=404, content=error_response("DOCUMENT_NOT_FOUND", "Document not found", False))
    AuditLogsRepository(session).create_log(
        action="document.updated",
        entity_type="document",
        entity_id=str(doc_id),
        user_id=UUID(current_user.id),
        payload={
            "request_id": get_request_id(request),
            "changed_fields": [
                key
                for key, value in {
                    "title": body.title,
                    "description": body.description,
                    "category_key": body.category_key,
                    "links": body.links,
                    "is_pinned": body.is_pinned,
                }.items()
                if value is not None
            ],
        },
    )
    session.commit()
    return {"document": updated}


@app.delete("/documents/{doc_id}")
async def delete_document(
    request: Request,
    doc_id: int,
    current_user=Depends(require_current_user),
    session: Session = Depends(get_session),
):
    rate_limiter.hit(key=f"{get_client_ip(request)}:{current_user.id}", rule=MUTATION_RATE_LIMIT_RULE)
    if doc_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    deleted = DocumentsRepository(session).delete_document_by_id(UUID(current_user.id), doc_id)
    if not deleted:
        return JSONResponse(status_code=404, content=error_response("DOCUMENT_NOT_FOUND", "Document not found", False))
    AuditLogsRepository(session).create_log(
        action="document.deleted",
        entity_type="document",
        entity_id=str(doc_id),
        user_id=UUID(current_user.id),
        payload={"request_id": get_request_id(request)},
    )
    session.commit()
    return Response(status_code=204)
