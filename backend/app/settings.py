import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


DEFAULT_DB_PATH = "./data/archive-url.db"
LEGACY_DB_PATH = "./data/snap-url.db"


def resolve_db_path() -> str:
    configured = os.getenv("DB_PATH")
    if configured:
        return configured

    target = Path(DEFAULT_DB_PATH)
    legacy = Path(LEGACY_DB_PATH)

    # Default path migration: if the new database doesn't exist yet but the old
    # archive does, move the full SQLite triplet into the new filename.
    if not target.exists() and legacy.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        for suffix in ("", "-shm", "-wal"):
            legacy_part = Path(f"{legacy}{suffix}")
            target_part = Path(f"{target}{suffix}")
            if legacy_part.exists() and not target_part.exists():
                os.replace(legacy_part, target_part)

    return str(target)


class Settings:
    port: int = int(os.getenv("PORT", "3000"))
    db_path: str = resolve_db_path()
    jina_fetch_timeout_ms: int = int(os.getenv("JINA_FETCH_TIMEOUT_MS", "20000"))
    ingest_concurrency: int = max(1, int(os.getenv("INGEST_CONCURRENCY", "1")))
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


settings = Settings()
