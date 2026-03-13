from __future__ import annotations

from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from ..settings import settings


def create_database_engine(database_url: Optional[str] = None) -> Engine:
    url = (database_url or settings.normalized_database_url or "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")
    return create_engine(url, pool_pre_ping=True)
