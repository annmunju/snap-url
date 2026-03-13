from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..models import AuditLog


class AuditLogsRepository:
    def __init__(self, session: Session):
        self.session = session

    def create_log(
        self,
        *,
        action: str,
        entity_type: str,
        entity_id: Optional[str] = None,
        user_id: Optional[UUID] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> AuditLog:
        log = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload or {},
        )
        self.session.add(log)
        self.session.flush()
        return log
