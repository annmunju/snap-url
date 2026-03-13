from __future__ import annotations

from sqlalchemy import text

from .session import SessionLocal
from ..settings import settings


def get_postgres_health() -> dict[str, str]:
    if not settings.has_postgres_config:
        return {"configured": "false", "status": "not_configured"}
    if SessionLocal is None:
        return {"configured": "true", "status": "unavailable"}

    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        return {"configured": "true", "status": "ok"}
    except Exception as error:  # noqa: BLE001
        return {"configured": "true", "status": "error", "message": str(error) or "Unknown error"}
