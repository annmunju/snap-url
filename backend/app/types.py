from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, model_validator

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


class IngestListQuery(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    status: Optional[IngestJobStatus] = None


class DocumentsListQuery(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class PatchDocumentRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    links: Optional[list[ExtractedLink]] = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def at_least_one_field(self):
        if self.title is None and self.description is None and self.links is None:
            raise ValueError("At least one field is required")
        return self
