import re
import json
from uuid import UUID
from typing import Any, Dict, Optional, TypedDict
from urllib.parse import urlparse

import httpx
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from .categories import (
    classify_category_key_with_confidence,
    enforce_category_policy,
    get_category_keys,
    normalize_category_key,
)
from .db import db
from .postgres.session import session_scope
from .repositories import DocumentsRepository
from .settings import settings


class PipelineState(TypedDict, total=False):
    user_id: str
    raw_url: str
    manual_description: str
    url: str
    jina_url: str
    markdown: str
    extracted: dict[str, Any]
    summary: str
    category_key: str
    stored_id: int


_llm: Optional[ChatOpenAI] = None
if settings.openai_api_key:
    _llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0.2,
        api_key=settings.openai_api_key,
    )


def normalize_url(raw_url: str) -> str:
    no_backslashes = raw_url.strip().replace("\\", "").replace("%5C", "").replace("%5c", "")
    parsed = urlparse(no_backslashes)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("Invalid URL")
    return no_backslashes


def to_jina_url(url: str) -> str:
    without_protocol = re.sub(r"^https?://", "", url, flags=re.IGNORECASE)
    return f"https://r.jina.ai/http://{without_protocol}"


def is_image_url(url: str) -> bool:
    image_extensions = {
        ".apng",
        ".avif",
        ".bmp",
        ".gif",
        ".heic",
        ".heif",
        ".ico",
        ".jfif",
        ".jpeg",
        ".jpg",
        ".png",
        ".svg",
        ".tif",
        ".tiff",
        ".webp",
    }
    try:
        parsed = urlparse(url)
    except Exception:  # noqa: BLE001
        return False
    path = (parsed.path or "").lower()
    return any(path.endswith(ext) for ext in image_extensions)


def extract_links_from_markdown(markdown: str, base_url: str) -> list[dict[str, str]]:
    link_regex = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
    seen: set[str] = set()
    links: list[dict[str, str]] = []

    for match in link_regex.finditer(markdown):
        content = (match.group(1) or "").strip()
        url = (match.group(2) or "").strip()
        if not url or url in seen or is_image_url(url):
            continue
        seen.add(url)
        links.append({"url": url, "content": content})

    if base_url not in seen:
        links.insert(0, {"url": base_url, "content": "original source"})

    return links[:100]


def first_non_empty_line(text: str) -> str:
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped:
            return stripped
    return "(제목 없음)"


def strip_markdown(text: str) -> str:
    return (
        re.sub(
            r"\s+",
            " ",
            re.sub(
                r"\*\*|__|\*|_",
                "",
                re.sub(
                    r"^#{1,6}\s+",
                    "",
                    re.sub(
                        r"\[([^\]]+)\]\([^)]*\)",
                        r"\1",
                        re.sub(
                            r"!\[[^\]]*\]\([^)]*\)",
                            " ",
                            re.sub(r"`([^`]+)`", r"\1", re.sub(r"```[\s\S]*?```", " ", text)),
                        ),
                    ),
                    flags=re.MULTILINE,
                ),
            ),
        ).strip()
    )


def fallback_summary(text: str) -> str:
    collapsed = re.sub(r"\s+", " ", text).strip()
    if not collapsed:
        return "요약할 본문이 비어 있습니다."
    if len(collapsed) <= 500:
        return collapsed
    return f"{collapsed[:500]}..."


async def normalize_node(state: PipelineState) -> dict[str, Any]:
    url = normalize_url(state["raw_url"])
    return {
        "url": url,
        "jina_url": to_jina_url(url),
    }


async def fetch_jina_node(state: PipelineState) -> dict[str, Any]:
    timeout_seconds = settings.jina_fetch_timeout_ms / 1000
    async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
        response = await client.get(state["jina_url"], headers={"User-Agent": "archive-url-bot/0.1"})

    if response.status_code < 200 or response.status_code >= 300:
        raise RuntimeError(f"Jina fetch failed: {response.status_code} {response.reason_phrase}")

    markdown = response.text
    if not markdown or len(markdown.strip()) < 30:
        raise RuntimeError("Jina fetch returned empty markdown")

    return {"markdown": markdown}


async def extract_node(state: PipelineState) -> dict[str, Any]:
    markdown = state["markdown"].strip()
    title = first_non_empty_line(markdown).removeprefix("# ")[:180]
    plain = strip_markdown(markdown)

    extracted = {
        "title": title,
        "description": "",
        "content": plain[:30000],
        "contentHtmls": [],
        "links": extract_links_from_markdown(markdown, state["url"]),
    }
    return {"extracted": extracted}


async def summarize_node(state: PipelineState) -> dict[str, Any]:
    extracted = state["extracted"]
    title = extracted["title"]
    description = extracted["description"]
    content = extracted["content"]

    if _llm is None:
        return {"summary": fallback_summary(f"{title}\n{description}\n{content}")}

    trimmed = content[:12000]
    prompt = "\n".join(
        [
            "다음 문서를 한국어로 간결하게 요약해줘.",
            "출력 형식:",
            "1) 한 줄 핵심",
            "2) 주요 포인트 3개",
            "3) 원문 읽기 전에 알아야 할 맥락 1개",
            "문서 제목:",
            title or "(제목 없음)",
            "문서 설명:",
            description or "(설명 없음)",
            "문서 본문:",
            trimmed or "(본문 없음)",
        ]
    )

    result = await _llm.ainvoke(prompt)
    result_content = result.content if isinstance(result.content, str) else str(result.content)
    return {"summary": result_content.strip()}


def _extract_json_object(raw_text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(raw_text)
    except Exception:  # noqa: BLE001
        match = re.search(r"\{[\s\S]*\}", raw_text)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:  # noqa: BLE001
            return None


async def classify_category_node(state: PipelineState) -> dict[str, Any]:
    extracted = state["extracted"]
    classification_texts = (
        extracted["title"],
        extracted["description"],
        state["summary"],
        extracted["content"][:2000],
    )
    fallback, confident = classify_category_key_with_confidence(*classification_texts, source_url=state["url"])

    if confident:
        return {"category_key": fallback}

    if _llm is None:
        return {"category_key": fallback}

    allowed_keys = get_category_keys()
    trimmed = extracted["content"][:3000]
    prompt = "\n".join(
        [
            "다음 문서를 분류해라.",
            f"허용 category_key: {', '.join(allowed_keys)}",
            "분류 규칙:",
            "1) 뉴스/기사/보도문 형식이면 주제와 무관하게 news를 우선한다.",
            "2) tech는 소프트웨어 개발/프로그래밍/엔지니어링 문서일 때만 사용한다.",
            "3) business는 시장/경영/투자/마케팅/기업 전략 주제일 때 사용한다.",
            f"4) 애매하면 {fallback} 사용.",
            '출력은 JSON 한 줄만: {"category_key":"..."}',
            "문서 제목:",
            extracted["title"] or "(제목 없음)",
            "문서 설명:",
            extracted["description"] or "(설명 없음)",
            "문서 요약:",
            state["summary"] or "(요약 없음)",
            "문서 본문 발췌:",
            trimmed or "(본문 없음)",
        ]
    )

    try:
        result = await _llm.ainvoke(prompt)
        result_content = result.content if isinstance(result.content, str) else str(result.content)
        payload = _extract_json_object(result_content)
        candidate = payload.get("category_key") if isinstance(payload, dict) else None
        normalized = normalize_category_key(candidate)
        policy_checked = enforce_category_policy(normalized, *classification_texts, source_url=state["url"])
        return {"category_key": policy_checked}
    except Exception:  # noqa: BLE001
        return {"category_key": fallback}


async def persist_node(state: PipelineState) -> dict[str, Any]:
    extracted = state["extracted"]
    manual_description = (state.get("manual_description") or "").strip()
    payload = {
        "url": state["url"],
        "title": extracted["title"],
        "description": manual_description or extracted["description"],
        "content": extracted["content"],
        "summary": state["summary"],
        "category_key": state["category_key"],
        "links": extracted["links"],
    }

    if settings.has_postgres_config and state.get("user_id"):
        with session_scope() as session:
            row = DocumentsRepository(session).upsert_document(UUID(state["user_id"]), payload)
    else:
        row = db.upsert_document(payload)
    return {"stored_id": int(row["id"])}


_graph_builder: StateGraph = StateGraph(PipelineState)
_graph_builder.add_node("normalize", normalize_node)
_graph_builder.add_node("fetch_jina", fetch_jina_node)
_graph_builder.add_node("extract", extract_node)
_graph_builder.add_node("summarize", summarize_node)
_graph_builder.add_node("classify_category", classify_category_node)
_graph_builder.add_node("persist", persist_node)
_graph_builder.add_edge(START, "normalize")
_graph_builder.add_edge("normalize", "fetch_jina")
_graph_builder.add_edge("fetch_jina", "extract")
_graph_builder.add_edge("extract", "summarize")
_graph_builder.add_edge("summarize", "classify_category")
_graph_builder.add_edge("classify_category", "persist")
_graph_builder.add_edge("persist", END)
_graph = _graph_builder.compile()


async def ingest_url(raw_url: str, manual_description: Optional[str] = None, user_id: Optional[str] = None) -> dict[str, Any]:
    output: PipelineState = await _graph.ainvoke(
        {
            "user_id": user_id or "",
            "raw_url": raw_url,
            "manual_description": manual_description or "",
            "url": raw_url,
            "jina_url": "",
            "markdown": "",
        }
    )

    return {
        "id": output["stored_id"],
        "url": output["url"],
        "jinaUrl": output["jina_url"],
        "fetchMode": "jina-markdown",
        "extracted": output["extracted"],
        "summary": output["summary"],
    }
