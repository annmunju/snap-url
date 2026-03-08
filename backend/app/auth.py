from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, cast

import httpx
from fastapi import Depends, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .postgres.session import SessionLocal
from .repositories import UsersRepository
from .settings import settings


class AuthConfigError(RuntimeError):
    pass


@dataclass
class CurrentUser:
    id: str
    email: str
    auth_subject: str
    status: str


class AuthenticationError(Exception):
    def __init__(self, code: str, message: str, status_code: int, retryable: bool = False):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        super().__init__(message)


_jwk_client: Optional[Any] = None


def _load_jwt():
    try:
        import jwt as jwt_module
        from jwt import InvalidTokenError as invalid_token_error
    except ModuleNotFoundError as error:
        raise AuthConfigError("PyJWT[crypto] is not installed") from error
    return jwt_module, invalid_token_error


def get_session():
    if SessionLocal is None:
        raise AuthConfigError("DATABASE_URL is not configured")
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _get_jwk_client():
    global _jwk_client
    jwks_url = settings.resolved_supabase_jwks_url
    if not jwks_url:
        raise AuthConfigError("Supabase JWKS URL is not configured")
    if _jwk_client is None:
        try:
            from jwt import PyJWKClient
        except ModuleNotFoundError as error:
            raise AuthConfigError("PyJWT[crypto] is not installed") from error
        _jwk_client = PyJWKClient(jwks_url)
    return _jwk_client


def _parse_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise AuthenticationError("UNAUTHORIZED", "Authentication required", 401)
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthenticationError("UNAUTHORIZED", "Invalid authorization header", 401)
    return token.strip()


def _decode_access_token(token: str) -> dict[str, Any]:
    if settings.has_dev_auth and token == (settings.dev_auth_token or "").strip():
        return {
            "sub": f"dev:{settings.dev_auth_email}",
            "email": settings.dev_auth_email,
            "user_metadata": {
                "name": "Dev User",
                "display_name": "Dev User",
            },
        }

    issuer = settings.resolved_supabase_issuer
    if not settings.has_auth_config or not issuer:
        raise AuthConfigError("Supabase auth config is incomplete")

    jwt_module, invalid_token_error = _load_jwt()

    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        claims = jwt_module.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.supabase_jwt_audience,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt_module.ExpiredSignatureError as error:
        raise AuthenticationError("TOKEN_EXPIRED", "Access token expired", 401, retryable=True) from error
    except invalid_token_error as error:
        raise AuthenticationError("UNAUTHORIZED", "Invalid access token", 401) from error

    if not claims.get("email"):
        raise AuthenticationError("UNAUTHORIZED", "Email claim missing", 401)
    return cast(dict[str, Any], claims)


def require_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    session: Session = Depends(get_session),
) -> CurrentUser:
    token = _parse_bearer_token(authorization)
    claims = _decode_access_token(token)

    repo = UsersRepository(session)
    user = repo.upsert_from_auth_claims(claims)
    if user.status == "disabled":
        raise AuthenticationError("ACCOUNT_DISABLED", "Account disabled", 403)
    if user.status == "deleted":
        raise AuthenticationError("ACCOUNT_DELETED", "Account deleted", 403)

    session.commit()

    current_user = CurrentUser(
        id=str(user.id),
        email=user.email,
        auth_subject=user.auth_subject,
        status=user.status,
    )
    request.state.current_user = current_user
    return current_user


def require_current_user_allow_deleted(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    session: Session = Depends(get_session),
) -> CurrentUser:
    token = _parse_bearer_token(authorization)
    claims = _decode_access_token(token)

    repo = UsersRepository(session)
    user = repo.upsert_from_auth_claims(claims)
    if user.status == "disabled":
        raise AuthenticationError("ACCOUNT_DISABLED", "Account disabled", 403)

    session.commit()

    current_user = CurrentUser(
        id=str(user.id),
        email=user.email,
        auth_subject=user.auth_subject,
        status=user.status,
    )
    request.state.current_user = current_user
    return current_user


async def check_supabase_health() -> dict[str, str]:
    if not settings.has_auth_config:
        return {"configured": "false", "status": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(settings.resolved_supabase_jwks_url or "")
        if response.status_code == 200:
            return {"configured": "true", "status": "ok"}
        return {"configured": "true", "status": "error", "message": f"JWKS responded {response.status_code}"}
    except Exception as error:  # noqa: BLE001
        return {"configured": "true", "status": "error", "message": str(error) or "Unknown error"}


def auth_error_response(error: AuthenticationError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "code": error.code,
                "message": error.message,
                "retryable": error.retryable,
            }
        },
    )
