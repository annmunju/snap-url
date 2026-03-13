from __future__ import annotations

import argparse
import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import delete, func, select

from app.models import Document, IngestJob, User
from app.postgres.session import session_scope
from app.settings import DEFAULT_DB_PATH, LEGACY_DB_PATH, settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class ImportTarget:
    user_id: uuid.UUID
    email: str
    auth_subject: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import legacy SQLite documents and ingest jobs into Postgres for a single target user."
    )
    parser.add_argument("--sqlite-path", help="Path to the legacy SQLite database file.")
    parser.add_argument("--email", help="Target user email. Defaults to DEV_AUTH_EMAIL.")
    parser.add_argument("--auth-subject", help="Target auth subject. Defaults to dev:<email>.")
    parser.add_argument("--auth-provider", default="dev", help="Target auth provider when creating a user.")
    parser.add_argument("--display-name", default="Dev User", help="Display name when creating a user.")
    parser.add_argument(
        "--wipe-user-data",
        action="store_true",
        help="Delete existing documents and ingest jobs for the target user before import.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read and validate the SQLite source and target user without writing to Postgres.",
    )
    return parser.parse_args()


def resolve_sqlite_path(explicit_path: Optional[str]) -> Path:
    backend_default = BACKEND_DIR / "data" / "archive-url.db"
    backend_legacy = BACKEND_DIR / "data" / "snap-url.db"
    candidates = [
        Path(explicit_path) if explicit_path else None,
        backend_default,
        backend_legacy,
        BACKEND_DIR / settings.db_path,
        BACKEND_DIR / DEFAULT_DB_PATH,
        BACKEND_DIR / LEGACY_DB_PATH,
        Path(settings.db_path),
        Path(DEFAULT_DB_PATH),
        Path(LEGACY_DB_PATH),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Legacy SQLite database not found. Pass --sqlite-path or place it at "
        f"{DEFAULT_DB_PATH} or {LEGACY_DB_PATH}."
    )


def open_sqlite(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        parsed = datetime.strptime(normalized, "%Y-%m-%d %H:%M:%S")
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_links(raw_links: Optional[str]) -> list[dict[str, Any]]:
    if not raw_links:
        return []
    try:
        decoded = json.loads(raw_links)
    except json.JSONDecodeError:
        return []
    if isinstance(decoded, list):
        return [item for item in decoded if isinstance(item, dict)]
    return []


def read_legacy_documents(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT id, url, title, description, content, summary, category_key, is_pinned, links, created_at
        FROM documents
        ORDER BY id ASC
        """
    ).fetchall()


def read_legacy_jobs(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT id, request_id, idempotency_key, raw_url, normalized_url, description, status,
               attempt, max_attempts, error_code, error_message, document_id,
               created_at, updated_at, started_at, finished_at
        FROM ingest_jobs
        ORDER BY id ASC
        """
    ).fetchall()


def resolve_target_user(
    *,
    email: str,
    auth_subject: str,
    auth_provider: str,
    display_name: str,
) -> ImportTarget:
    with session_scope() as session:
        existing = session.scalar(select(User).where(func.lower(User.email) == email.lower()))
        if existing is not None:
            return ImportTarget(user_id=existing.id, email=existing.email, auth_subject=existing.auth_subject)

        existing = session.scalar(select(User).where(User.auth_subject == auth_subject))
        if existing is not None:
            return ImportTarget(user_id=existing.id, email=existing.email, auth_subject=existing.auth_subject)

        user = User(
            auth_provider=auth_provider,
            auth_subject=auth_subject,
            email=email.lower(),
            display_name=display_name,
            avatar_url=None,
            status="active",
        )
        session.add(user)
        session.flush()
        session.refresh(user)
        return ImportTarget(user_id=user.id, email=user.email, auth_subject=user.auth_subject)


def ensure_target_is_ready(user_id: uuid.UUID, wipe_user_data: bool) -> None:
    with session_scope() as session:
        existing_docs = session.scalar(select(func.count()).select_from(Document).where(Document.user_id == user_id)) or 0
        existing_jobs = (
            session.scalar(select(func.count()).select_from(IngestJob).where(IngestJob.user_id == user_id)) or 0
        )
        if existing_docs == 0 and existing_jobs == 0:
            return
        if not wipe_user_data:
            raise RuntimeError(
                f"Target user already has data (documents={existing_docs}, ingest_jobs={existing_jobs}). "
                "Re-run with --wipe-user-data to replace it."
            )

        session.execute(delete(IngestJob).where(IngestJob.user_id == user_id))
        session.execute(delete(Document).where(Document.user_id == user_id))


def make_request_id(target_user_id: uuid.UUID, legacy_job: sqlite3.Row) -> uuid.UUID:
    raw = f"{target_user_id}:{legacy_job['id']}:{legacy_job['request_id']}"
    return uuid.uuid5(uuid.NAMESPACE_URL, raw)


def import_data(
    *,
    user: ImportTarget,
    legacy_documents: list[sqlite3.Row],
    legacy_jobs: list[sqlite3.Row],
) -> tuple[int, int]:
    doc_id_map: dict[int, int] = {}

    with session_scope() as session:
        for row in legacy_documents:
            created_at = parse_timestamp(row["created_at"]) or datetime.now(timezone.utc)
            document = Document(
                user_id=user.user_id,
                url=row["url"],
                title=row["title"],
                description=row["description"] or "",
                content=row["content"] or "",
                summary=row["summary"] or "",
                category_key=row["category_key"] or "uncategorized",
                is_pinned=bool(row["is_pinned"]),
                links=parse_links(row["links"]),
                created_at=created_at,
                updated_at=created_at,
            )
            session.add(document)
            session.flush()
            doc_id_map[int(row["id"])] = int(document.id)

        for row in legacy_jobs:
            created_at = parse_timestamp(row["created_at"]) or datetime.now(timezone.utc)
            updated_at = parse_timestamp(row["updated_at"]) or created_at
            job = IngestJob(
                user_id=user.user_id,
                request_id=make_request_id(user.user_id, row),
                idempotency_key=row["idempotency_key"],
                raw_url=row["raw_url"],
                normalized_url=row["normalized_url"],
                description=row["description"],
                status=row["status"],
                attempt=int(row["attempt"] or 0),
                max_attempts=int(row["max_attempts"] or 2),
                error_code=row["error_code"],
                error_message=row["error_message"],
                document_id=doc_id_map.get(int(row["document_id"])) if row["document_id"] is not None else None,
                created_at=created_at,
                updated_at=updated_at,
                started_at=parse_timestamp(row["started_at"]),
                finished_at=parse_timestamp(row["finished_at"]),
            )
            session.add(job)

    return len(legacy_documents), len(legacy_jobs)


def main() -> None:
    args = parse_args()

    if not settings.has_postgres_config:
        raise RuntimeError("DATABASE_URL is not configured.")

    target_email = (args.email or settings.dev_auth_email or "").strip().lower()
    if not target_email:
        raise RuntimeError("Target email is required. Set DEV_AUTH_EMAIL or pass --email.")

    target_auth_subject = (args.auth_subject or f"dev:{target_email}").strip()
    sqlite_path = resolve_sqlite_path(args.sqlite_path)

    conn = open_sqlite(sqlite_path)
    try:
        legacy_documents = read_legacy_documents(conn)
        legacy_jobs = read_legacy_jobs(conn)
    finally:
        conn.close()

    print(f"SQLite source: {sqlite_path}")
    print(f"Legacy rows: documents={len(legacy_documents)}, ingest_jobs={len(legacy_jobs)}")
    print(f"Target email: {target_email}")
    print(f"Target auth_subject: {target_auth_subject}")

    user = resolve_target_user(
        email=target_email,
        auth_subject=target_auth_subject,
        auth_provider=args.auth_provider,
        display_name=args.display_name,
    )
    print(f"Target user id: {user.user_id}")

    if args.dry_run:
        print("Dry run complete. No Postgres rows were written.")
        return

    ensure_target_is_ready(user.user_id, args.wipe_user_data)
    imported_documents, imported_jobs = import_data(
        user=user,
        legacy_documents=legacy_documents,
        legacy_jobs=legacy_jobs,
    )
    print(f"Import complete: documents={imported_documents}, ingest_jobs={imported_jobs}")


if __name__ == "__main__":
    main()
