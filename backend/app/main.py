from uuid import uuid4
from typing import Optional

from fastapi import FastAPI, Header, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from .db import db
from .jobs import bootstrap_ingest_worker, enqueue_ingest_job
from .pipeline import normalize_url
from .settings import settings
from .types import DocumentsListQuery, IngestListQuery, IngestRequest, PatchDocumentRequest

app = FastAPI()


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
async def validation_exception_handler(_request, exc: RequestValidationError):
    only_query_errors = bool(exc.errors()) and all(
        len(issue.get("loc", [])) > 0 and issue["loc"][0] == "query" for issue in exc.errors()
    )
    message = "Invalid query" if only_query_errors else "Invalid request body"
    return JSONResponse(
        status_code=400,
        content=error_response("INVALID_REQUEST_BODY", message, False, {"issues": exc.errors()}),
    )


@app.exception_handler(ValidationError)
async def pydantic_validation_exception_handler(_request, exc: ValidationError):
    return JSONResponse(
        status_code=400,
        content=error_response("INVALID_REQUEST_BODY", "Invalid request body", False, {"issues": exc.errors()}),
    )


@app.on_event("startup")
async def startup_event():
    boot = await bootstrap_ingest_worker()
    if boot["recoveredRunning"] or boot["queued"]:
        print(
            f"ingest worker bootstrapped: recoveredRunning={boot['recoveredRunning']}, queued={boot['queued']}"
        )
    print(f"snap-url API listening on port {settings.port}")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ingest")
async def ingest(body: IngestRequest, idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key")):
    try:
        normalized_url = normalize_url(str(body.url))
        idempotency_key_trimmed = (idempotency_key or "").strip()

        if idempotency_key_trimmed:
            existing = db.get_ingest_job_by_idempotency_key(idempotency_key_trimmed, normalized_url)
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

        existing_running = db.get_running_ingest_job_by_normalized_url(normalized_url)
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

        job = db.create_ingest_job(
            {
                "request_id": str(uuid4()),
                "idempotency_key": idempotency_key_trimmed or None,
                "raw_url": str(body.url),
                "normalized_url": normalized_url,
                "max_attempts": 2,
            }
        )

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
async def get_ingest_job(job_id: int):
    if job_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    job = db.get_ingest_job_by_id(job_id)
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
    limit: int = Query(default=20, ge=1, le=100), status: Optional[str] = Query(default=None)
):
    try:
        parsed = IngestListQuery(limit=limit, status=status)
    except ValidationError as exc:
        return JSONResponse(
            status_code=400,
            content=error_response("INVALID_REQUEST_BODY", "Invalid query", False, {"issues": exc.errors()}),
        )
    items = db.list_ingest_jobs(parsed.limit, parsed.status)
    return {
        "items": [
            {
                "id": job["id"],
                "status": job["status"],
                "normalized_url": job["normalized_url"],
                "document_id": job["document_id"],
                "updated_at": job["updated_at"],
            }
            for job in items
        ]
    }


@app.get("/documents")
async def list_documents(limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    try:
        parsed = DocumentsListQuery(limit=limit, offset=offset)
    except ValidationError as exc:
        return JSONResponse(
            status_code=400,
            content=error_response("INVALID_REQUEST_BODY", "Invalid query", False, {"issues": exc.errors()}),
        )
    return {"items": db.list_documents(parsed.limit, parsed.offset)}


@app.get("/documents/{doc_id}")
async def get_document(doc_id: int):
    if doc_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    row = db.get_document_by_id(doc_id)
    if not row:
        return JSONResponse(status_code=404, content=error_response("DOCUMENT_NOT_FOUND", "Document not found", False))
    return {"document": row}


@app.patch("/documents/{doc_id}")
async def patch_document(doc_id: int, body: PatchDocumentRequest):
    if doc_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    updated = db.update_document_by_id(
        doc_id,
        {
            "title": body.title,
            "description": body.description,
            "links": [link.model_dump(mode="json") for link in body.links] if body.links is not None else None,
        },
    )
    if not updated:
        return JSONResponse(status_code=404, content=error_response("DOCUMENT_NOT_FOUND", "Document not found", False))
    return {"document": updated}


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: int):
    if doc_id <= 0:
        return JSONResponse(status_code=400, content=error_response("INVALID_REQUEST_BODY", "Invalid id", False))

    deleted = db.delete_document_by_id(doc_id)
    if not deleted:
        return JSONResponse(status_code=404, content=error_response("DOCUMENT_NOT_FOUND", "Document not found", False))
    return Response(status_code=204)
