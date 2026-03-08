from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Document


def _map_document(row: Document) -> dict[str, Any]:
    return {
        "id": row.id,
        "user_id": str(row.user_id),
        "url": row.url,
        "title": row.title,
        "description": row.description,
        "content": row.content,
        "summary": row.summary,
        "category_key": row.category_key,
        "is_pinned": row.is_pinned,
        "links": row.links,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


class DocumentsRepository:
    def __init__(self, session: Session):
        self.session = session

    def upsert_document(self, user_id: UUID, input_data: dict[str, Any]) -> dict[str, Any]:
        existing = self.session.scalar(select(Document).where(Document.user_id == user_id, Document.url == input_data["url"]))
        if existing is None:
            existing = Document(
                user_id=user_id,
                url=input_data["url"],
                title=input_data["title"],
                description=input_data["description"],
                content=input_data["content"],
                summary=input_data["summary"],
                category_key=input_data.get("category_key", "uncategorized"),
                links=input_data["links"],
            )
            self.session.add(existing)
            self.session.flush()
            self.session.refresh(existing)
            return _map_document(existing)

        existing.title = input_data["title"]
        existing.description = input_data["description"]
        existing.content = input_data["content"]
        existing.summary = input_data["summary"]
        existing.category_key = input_data.get("category_key", "uncategorized")
        existing.links = input_data["links"]
        self.session.flush()
        self.session.refresh(existing)
        return _map_document(existing)

    def get_document_by_id(self, user_id: UUID, doc_id: int) -> Optional[dict[str, Any]]:
        row = self.session.scalar(select(Document).where(Document.user_id == user_id, Document.id == doc_id))
        return _map_document(row) if row is not None else None

    def list_documents(self, user_id: UUID, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
        rows = self.session.scalars(
            select(Document)
            .where(Document.user_id == user_id)
            .order_by(Document.is_pinned.desc(), Document.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
        return [_map_document(row) for row in rows]

    def count_documents(self, user_id: UUID) -> int:
        count = self.session.scalar(select(func.count()).select_from(Document).where(Document.user_id == user_id))
        return int(count or 0)

    def update_document_by_id(self, user_id: UUID, doc_id: int, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
        row = self.session.scalar(select(Document).where(Document.user_id == user_id, Document.id == doc_id))
        if row is None:
            return None

        if patch.get("title") is not None:
            row.title = patch["title"]
        if patch.get("description") is not None:
            row.description = patch["description"]
        if patch.get("category_key") is not None:
            row.category_key = patch["category_key"]
        if patch.get("links") is not None:
            row.links = patch["links"]
        if patch.get("is_pinned") is not None:
            row.is_pinned = bool(patch["is_pinned"])

        self.session.flush()
        self.session.refresh(row)
        return _map_document(row)

    def delete_document_by_id(self, user_id: UUID, doc_id: int) -> bool:
        row = self.session.scalar(select(Document).where(Document.user_id == user_id, Document.id == doc_id))
        if row is None:
            return False
        self.session.delete(row)
        self.session.flush()
        return True
