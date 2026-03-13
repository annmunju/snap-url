from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class IngestJob(Base):
    __tablename__ = "ingest_jobs"
    __table_args__ = (
        Index("ix_ingest_jobs_user_status_updated", "user_id", "status", "updated_at"),
        Index("ix_ingest_jobs_user_normalized_url", "user_id", "normalized_url"),
        Index(
            "uq_ingest_jobs_user_idempotency_normalized_url",
            "user_id",
            "idempotency_key",
            "normalized_url",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
        UniqueConstraint("request_id", name="uq_ingest_jobs_request_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, default=uuid.uuid4)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    raw_url: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=2, server_default="2")
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("documents.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
