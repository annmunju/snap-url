import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


class Settings:
    port: int = int(os.getenv("PORT", "3000"))
    db_path: str = os.getenv("DB_PATH", "./data/snap-url.db")
    jina_fetch_timeout_ms: int = int(os.getenv("JINA_FETCH_TIMEOUT_MS", "20000"))
    ingest_concurrency: int = max(1, int(os.getenv("INGEST_CONCURRENCY", "1")))
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


settings = Settings()
