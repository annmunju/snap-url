import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv


def load_environment_files() -> None:
    environment = (os.getenv("ENVIRONMENT") or "development").strip() or "development"
    candidates = (
        ".env",
        f".env.{environment}",
        ".env.local",
        f".env.{environment}.local",
    )

    for filename in candidates:
        load_dotenv(filename, override=True)


load_environment_files()


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
    environment: str = os.getenv("ENVIRONMENT", "development")
    sentry_dsn: Optional[str] = os.getenv("SENTRY_DSN")
    sentry_traces_sample_rate: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))
    db_path: str = resolve_db_path()
    database_url: Optional[str] = os.getenv("DATABASE_URL")
    supabase_url: Optional[str] = os.getenv("SUPABASE_URL")
    supabase_jwt_audience: str = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    supabase_jwt_issuer: Optional[str] = os.getenv("SUPABASE_JWT_ISSUER")
    dev_auth_token: Optional[str] = os.getenv("DEV_AUTH_TOKEN")
    dev_auth_email: str = os.getenv("DEV_AUTH_EMAIL", "annmungdo@naver.com")
    jina_fetch_timeout_ms: int = int(os.getenv("JINA_FETCH_TIMEOUT_MS", "20000"))
    ingest_concurrency: int = max(1, int(os.getenv("INGEST_CONCURRENCY", "1")))
    ingest_rate_limit_count: int = max(1, int(os.getenv("INGEST_RATE_LIMIT_COUNT", "20")))
    ingest_rate_limit_window_seconds: int = max(1, int(os.getenv("INGEST_RATE_LIMIT_WINDOW_SECONDS", "60")))
    mutation_rate_limit_count: int = max(1, int(os.getenv("MUTATION_RATE_LIMIT_COUNT", "30")))
    mutation_rate_limit_window_seconds: int = max(1, int(os.getenv("MUTATION_RATE_LIMIT_WINDOW_SECONDS", "300")))
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    @property
    def has_postgres_config(self) -> bool:
        return bool(self.database_url and self.database_url.strip())

    @property
    def normalized_database_url(self) -> Optional[str]:
        raw = (self.database_url or "").strip()
        if not raw:
            return None
        if raw.startswith("postgres://"):
            return raw.replace("postgres://", "postgresql+psycopg://", 1)
        if raw.startswith("postgresql://") and "+psycopg" not in raw and "+psycopg2" not in raw:
            return raw.replace("postgresql://", "postgresql+psycopg://", 1)
        return raw

    @property
    def resolved_supabase_issuer(self) -> Optional[str]:
        if self.supabase_jwt_issuer and self.supabase_jwt_issuer.strip():
            return self.supabase_jwt_issuer.strip()
        if self.supabase_url and self.supabase_url.strip():
            return f"{self.supabase_url.rstrip('/')}/auth/v1"
        return None

    @property
    def resolved_supabase_jwks_url(self) -> Optional[str]:
        issuer = self.resolved_supabase_issuer
        if not issuer:
            return None
        return f"{issuer.rstrip('/')}/.well-known/jwks.json"

    @property
    def has_auth_config(self) -> bool:
        return bool(self.supabase_url and self.supabase_url.strip() and self.resolved_supabase_issuer)

    @property
    def has_dev_auth(self) -> bool:
        return bool(self.dev_auth_token and self.dev_auth_token.strip())


settings = Settings()
