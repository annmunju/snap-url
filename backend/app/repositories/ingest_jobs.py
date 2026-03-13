from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import IngestJob


def _map_job(row: IngestJob) -> dict[str, Any]:
    return {
        "id": row.id,
        "user_id": str(row.user_id),
        "request_id": str(row.request_id),
        "idempotency_key": row.idempotency_key,
        "raw_url": row.raw_url,
        "normalized_url": row.normalized_url,
        "description": row.description,
        "status": row.status,
        "attempt": row.attempt,
        "max_attempts": row.max_attempts,
        "error_code": row.error_code,
        "error_message": row.error_message,
        "document_id": row.document_id,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
    }


class IngestJobsRepository:
    def __init__(self, session: Session):
        self.session = session

    def create_ingest_job(self, user_id: UUID, input_data: dict[str, Any]) -> dict[str, Any]:
        row = IngestJob(
            user_id=user_id,
            request_id=input_data["request_id"],
            idempotency_key=input_data.get("idempotency_key"),
            raw_url=input_data["raw_url"],
            normalized_url=input_data["normalized_url"],
            description=input_data.get("description"),
            status="queued",
            attempt=0,
            max_attempts=input_data["max_attempts"],
        )
        self.session.add(row)
        self.session.flush()
        self.session.refresh(row)
        return _map_job(row)

    def get_ingest_job_by_id(self, user_id: UUID, job_id: int) -> Optional[dict[str, Any]]:
        row = self.session.scalar(select(IngestJob).where(IngestJob.user_id == user_id, IngestJob.id == job_id))
        return _map_job(row) if row is not None else None

    def get_ingest_job_for_worker(self, job_id: int) -> Optional[dict[str, Any]]:
        row = self.session.get(IngestJob, job_id)
        return _map_job(row) if row is not None else None

    def get_ingest_job_by_idempotency_key(
        self, user_id: UUID, idempotency_key: str, normalized_url: str
    ) -> Optional[dict[str, Any]]:
        row = self.session.scalar(
            select(IngestJob)
            .where(
                IngestJob.user_id == user_id,
                IngestJob.idempotency_key == idempotency_key,
                IngestJob.normalized_url == normalized_url,
            )
            .order_by(IngestJob.id.desc())
            .limit(1)
        )
        return _map_job(row) if row is not None else None

    def get_running_ingest_job_by_normalized_url(self, user_id: UUID, normalized_url: str) -> Optional[dict[str, Any]]:
        row = self.session.scalar(
            select(IngestJob)
            .where(
                IngestJob.user_id == user_id,
                IngestJob.normalized_url == normalized_url,
                IngestJob.status == "running",
            )
            .order_by(IngestJob.id.desc())
            .limit(1)
        )
        return _map_job(row) if row is not None else None

    def list_ingest_jobs(self, user_id: UUID, limit: int = 20, status: Optional[str] = None) -> list[dict[str, Any]]:
        query = select(IngestJob).where(IngestJob.user_id == user_id)
        if status is not None:
            query = query.where(IngestJob.status == status)
        rows = self.session.scalars(query.order_by(IngestJob.updated_at.desc(), IngestJob.id.desc()).limit(limit)).all()
        return [_map_job(row) for row in rows]

    def mark_ingest_job_running(self, job_id: int) -> Optional[dict[str, Any]]:
        row = self.session.get(IngestJob, job_id)
        if row is None or row.status != "queued":
            return None
        row.status = "running"
        row.attempt += 1
        row.started_at = datetime.now(timezone.utc)
        self.session.flush()
        self.session.refresh(row)
        return _map_job(row)

    def mark_ingest_job_succeeded(self, job_id: int, document_id: int):
        row = self.session.get(IngestJob, job_id)
        if row is None:
            return
        row.status = "succeeded"
        row.document_id = document_id
        row.error_code = None
        row.error_message = None
        row.finished_at = datetime.now(timezone.utc)
        self.session.flush()

    def mark_ingest_job_failed(self, job_id: int, error_code: str, error_message: str):
        row = self.session.get(IngestJob, job_id)
        if row is None:
            return
        row.status = "failed"
        row.error_code = error_code
        row.error_message = error_message
        row.finished_at = datetime.now(timezone.utc)
        self.session.flush()

    def mark_ingest_job_queued_for_retry(self, job_id: int, error_code: str, error_message: str):
        row = self.session.get(IngestJob, job_id)
        if row is None:
            return
        row.status = "queued"
        row.error_code = error_code
        row.error_message = error_message
        row.started_at = None
        row.finished_at = None
        self.session.flush()

    def reset_running_jobs_to_queued(self) -> int:
        rows = self.session.scalars(select(IngestJob).where(IngestJob.status == "running")).all()
        for row in rows:
            row.status = "queued"
            row.started_at = None
        self.session.flush()
        return len(rows)

    def list_queued_job_ids(self) -> list[int]:
        rows = self.session.scalars(
            select(IngestJob.id).where(IngestJob.status == "queued").order_by(IngestJob.id.asc())
        ).all()
        return [int(row) for row in rows]
