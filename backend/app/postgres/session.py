from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy.orm import sessionmaker

from .engine import create_database_engine
from ..settings import settings


engine = create_database_engine() if settings.has_postgres_config else None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine is not None else None


@contextmanager
def session_scope():
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
