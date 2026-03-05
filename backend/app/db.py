import json
import os
import sqlite3
import threading
from typing import Any, Optional

from .settings import settings


class DB:
    def __init__(self, db_path: str):
        parent_dir = os.path.dirname(db_path) or "."
        os.makedirs(parent_dir, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._init_schema()

    def _init_schema(self):
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    content TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    links TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS ingest_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL UNIQUE,
                    idempotency_key TEXT,
                    raw_url TEXT NOT NULL,
                    normalized_url TEXT,
                    status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
                    attempt INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 2,
                    error_code TEXT,
                    error_message TEXT,
                    document_id INTEGER,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    started_at DATETIME,
                    finished_at DATETIME,
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
                );

                CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status_updated_at
                ON ingest_jobs(status, updated_at DESC);

                CREATE INDEX IF NOT EXISTS idx_ingest_jobs_normalized_url
                ON ingest_jobs(normalized_url);
                """
            )
            self._conn.commit()

    @staticmethod
    def _parse_document_row(row: Optional[sqlite3.Row]) -> Optional[dict[str, Any]]:
        if row is None:
            return None
        return {
            "id": row["id"],
            "url": row["url"],
            "title": row["title"],
            "description": row["description"],
            "content": row["content"],
            "summary": row["summary"],
            "links": json.loads(row["links"]),
            "created_at": row["created_at"],
        }

    @staticmethod
    def _parse_document_list_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "url": row["url"],
            "title": row["title"],
            "description": row["description"],
            "summary": row["summary"],
            "created_at": row["created_at"],
        }

    @staticmethod
    def _parse_job_row(row: Optional[sqlite3.Row]) -> Optional[dict[str, Any]]:
        if row is None:
            return None
        return {
            "id": row["id"],
            "request_id": row["request_id"],
            "idempotency_key": row["idempotency_key"],
            "raw_url": row["raw_url"],
            "normalized_url": row["normalized_url"],
            "status": row["status"],
            "attempt": row["attempt"],
            "max_attempts": row["max_attempts"],
            "error_code": row["error_code"],
            "error_message": row["error_message"],
            "document_id": row["document_id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
        }

    def upsert_document(self, input_data: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO documents (url, title, description, content, summary, links)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(url) DO UPDATE SET
                  title=excluded.title,
                  description=excluded.description,
                  content=excluded.content,
                  summary=excluded.summary,
                  links=excluded.links
                """,
                (
                    input_data["url"],
                    input_data["title"],
                    input_data["description"],
                    input_data["content"],
                    input_data["summary"],
                    json.dumps(input_data["links"]),
                ),
            )
            row = self._conn.execute(
                """
                SELECT id, url, title, description, content, summary, links, created_at
                FROM documents
                WHERE url = ?
                """,
                (input_data["url"],),
            ).fetchone()
            self._conn.commit()
        parsed = self._parse_document_row(row)
        assert parsed is not None
        return parsed

    def get_document_by_id(self, doc_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT id, url, title, description, content, summary, links, created_at
                FROM documents
                WHERE id = ?
                """,
                (doc_id,),
            ).fetchone()
        return self._parse_document_row(row)

    def list_documents(self, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id, url, title, description, summary, created_at
                FROM documents
                ORDER BY id DESC
                LIMIT ?
                OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        return [self._parse_document_list_row(row) for row in rows]

    def update_document_by_id(self, doc_id: int, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
        sets: list[str] = []
        params: list[Any] = []

        if patch.get("title") is not None:
            sets.append("title = ?")
            params.append(patch["title"])
        if patch.get("description") is not None:
            sets.append("description = ?")
            params.append(patch["description"])
        if patch.get("links") is not None:
            sets.append("links = ?")
            params.append(json.dumps(patch["links"]))

        if not sets:
            return self.get_document_by_id(doc_id)

        with self._lock:
            cursor = self._conn.execute(
                f"UPDATE documents SET {', '.join(sets)} WHERE id = ?",
                (*params, doc_id),
            )
            self._conn.commit()
            if cursor.rowcount == 0:
                return None
            row = self._conn.execute(
                """
                SELECT id, url, title, description, content, summary, links, created_at
                FROM documents
                WHERE id = ?
                """,
                (doc_id,),
            ).fetchone()
        return self._parse_document_row(row)

    def delete_document_by_id(self, doc_id: int) -> bool:
        with self._lock:
            self._conn.execute("UPDATE ingest_jobs SET document_id = NULL WHERE document_id = ?", (doc_id,))
            cursor = self._conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            self._conn.commit()
            return cursor.rowcount > 0

    def create_ingest_job(self, input_data: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            cursor = self._conn.execute(
                """
                INSERT INTO ingest_jobs (
                  request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts
                )
                VALUES (?, ?, ?, ?, 'queued', 0, ?)
                """,
                (
                    input_data["request_id"],
                    input_data["idempotency_key"],
                    input_data["raw_url"],
                    input_data["normalized_url"],
                    input_data["max_attempts"],
                ),
            )
            row = self._conn.execute(
                """
                SELECT
                  id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
                  error_code, error_message, document_id,
                  created_at, updated_at, started_at, finished_at
                FROM ingest_jobs
                WHERE id = ?
                """,
                (cursor.lastrowid,),
            ).fetchone()
            self._conn.commit()
        parsed = self._parse_job_row(row)
        assert parsed is not None
        return parsed

    def get_ingest_job_by_id(self, job_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT
                  id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
                  error_code, error_message, document_id,
                  created_at, updated_at, started_at, finished_at
                FROM ingest_jobs
                WHERE id = ?
                """,
                (job_id,),
            ).fetchone()
        return self._parse_job_row(row)

    def get_ingest_job_by_idempotency_key(
        self, idempotency_key: str, normalized_url: str
    ) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT
                  id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
                  error_code, error_message, document_id,
                  created_at, updated_at, started_at, finished_at
                FROM ingest_jobs
                WHERE idempotency_key = ? AND normalized_url = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (idempotency_key, normalized_url),
            ).fetchone()
        return self._parse_job_row(row)

    def get_running_ingest_job_by_normalized_url(self, normalized_url: str) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT
                  id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
                  error_code, error_message, document_id,
                  created_at, updated_at, started_at, finished_at
                FROM ingest_jobs
                WHERE normalized_url = ? AND status = 'running'
                ORDER BY id DESC
                LIMIT 1
                """,
                (normalized_url,),
            ).fetchone()
        return self._parse_job_row(row)

    def list_ingest_jobs(self, limit: int = 20, status: Optional[str] = None) -> list[dict[str, Any]]:
        with self._lock:
            if status is not None:
                rows = self._conn.execute(
                    """
                    SELECT
                      id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
                      error_code, error_message, document_id,
                      created_at, updated_at, started_at, finished_at
                    FROM ingest_jobs
                    WHERE status = ?
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (status, limit),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT
                      id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
                      error_code, error_message, document_id,
                      created_at, updated_at, started_at, finished_at
                    FROM ingest_jobs
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
        return [self._parse_job_row(row) for row in rows if row is not None]

    def mark_ingest_job_running(self, job_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            cursor = self._conn.execute(
                """
                UPDATE ingest_jobs
                SET
                  status = 'running',
                  attempt = attempt + 1,
                  started_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'queued'
                """,
                (job_id,),
            )
            if cursor.rowcount == 0:
                self._conn.commit()
                return None
            row = self._conn.execute(
                """
                SELECT
                  id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
                  error_code, error_message, document_id,
                  created_at, updated_at, started_at, finished_at
                FROM ingest_jobs
                WHERE id = ?
                """,
                (job_id,),
            ).fetchone()
            self._conn.commit()
        return self._parse_job_row(row)

    def mark_ingest_job_succeeded(self, job_id: int, document_id: int):
        with self._lock:
            self._conn.execute(
                """
                UPDATE ingest_jobs
                SET
                  status = 'succeeded',
                  document_id = ?,
                  error_code = NULL,
                  error_message = NULL,
                  finished_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (document_id, job_id),
            )
            self._conn.commit()

    def mark_ingest_job_failed(self, job_id: int, error_code: str, error_message: str):
        with self._lock:
            self._conn.execute(
                """
                UPDATE ingest_jobs
                SET
                  status = 'failed',
                  error_code = ?,
                  error_message = ?,
                  finished_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (error_code, error_message, job_id),
            )
            self._conn.commit()

    def mark_ingest_job_queued_for_retry(self, job_id: int, error_code: str, error_message: str):
        with self._lock:
            self._conn.execute(
                """
                UPDATE ingest_jobs
                SET
                  status = 'queued',
                  error_code = ?,
                  error_message = ?,
                  started_at = NULL,
                  finished_at = NULL,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (error_code, error_message, job_id),
            )
            self._conn.commit()

    def reset_running_jobs_to_queued(self) -> int:
        with self._lock:
            cursor = self._conn.execute(
                """
                UPDATE ingest_jobs
                SET
                  status = 'queued',
                  started_at = NULL,
                  updated_at = CURRENT_TIMESTAMP
                WHERE status = 'running'
                """
            )
            self._conn.commit()
            return cursor.rowcount

    def list_queued_job_ids(self) -> list[int]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id
                FROM ingest_jobs
                WHERE status = 'queued'
                ORDER BY id ASC
                """
            ).fetchall()
        return [int(row["id"]) for row in rows]


db = DB(settings.db_path)
