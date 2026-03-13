from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional, Union
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import User


class UsersRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_by_auth_subject(self, auth_subject: str) -> Optional[User]:
        return self.session.scalar(select(User).where(User.auth_subject == auth_subject))

    def get_by_email(self, email: str) -> Optional[User]:
        normalized_email = email.strip().lower()
        return self.session.scalar(select(User).where(User.email == normalized_email))

    def get_by_id(self, user_id: Union[str, UUID]) -> Optional[User]:
        return self.session.get(User, user_id)

    def upsert_from_auth_claims(self, claims: dict[str, Any]) -> User:
        auth_subject = str(claims["sub"])
        email = str(claims["email"]).strip().lower()
        raw_metadata = claims.get("user_metadata") or {}
        display_name = raw_metadata.get("display_name") or raw_metadata.get("name")
        avatar_url = raw_metadata.get("avatar_url")

        user = self.get_by_auth_subject(auth_subject)
        if user is None:
            user = self.get_by_email(email)
        if user is None:
            user = User(
                auth_provider="supabase",
                auth_subject=auth_subject,
                email=email,
                display_name=display_name,
                avatar_url=avatar_url,
                status="active",
            )
            self.session.add(user)
            self.session.flush()
            return user

        user.auth_provider = "supabase"
        user.auth_subject = auth_subject
        user.email = email
        user.display_name = display_name
        user.avatar_url = avatar_url
        self.session.flush()
        return user

    def update_profile(self, user: User, *, display_name: Optional[str]) -> User:
        user.display_name = display_name
        self.session.flush()
        return user

    def mark_deleted(self, user: User) -> User:
        user.status = "deleted"
        user.deleted_at = datetime.now(timezone.utc)
        self.session.flush()
        return user

    def reactivate(self, user: User) -> User:
        user.status = "active"
        user.deleted_at = None
        self.session.flush()
        return user
