from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, model_validator

from .categories import normalize_category_key

IngestJobStatus = Literal["queued", "running", "succeeded", "failed"]


class ExtractedLink(BaseModel):
    url: HttpUrl
    content: str = Field(min_length=1, max_length=500)


class ExtractedData(BaseModel):
    title: str
    description: str
    content: str
    contentHtmls: list[str]
    links: list[ExtractedLink]


class IngestRequest(BaseModel):
    url: HttpUrl
    description: Optional[str] = Field(default=None, min_length=1, max_length=1000)


class IngestListQuery(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    status: Optional[IngestJobStatus] = None


class DocumentsListQuery(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class PatchMeRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def at_least_one_field(self):
        if self.display_name is None:
            raise ValueError("At least one field is required")
        self.display_name = self.display_name.strip()
        return self


class PatchDocumentRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, max_length=1000)
    category_key: Optional[str] = None
    links: Optional[list[ExtractedLink]] = Field(default=None, max_length=100)
    is_pinned: Optional[bool] = None

    @model_validator(mode="after")
    def at_least_one_field(self):
        if (
            self.title is None
            and self.description is None
            and self.category_key is None
            and self.links is None
            and self.is_pinned is None
        ):
            raise ValueError("At least one field is required")
        if self.category_key is not None:
            self.category_key = normalize_category_key(self.category_key)
        return self
