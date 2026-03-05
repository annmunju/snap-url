import re
from urllib.parse import urlparse

import httpx
from openai import AsyncOpenAI

from .db import db
from .settings import settings

_llm = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None


def normalize_url(raw_url: str) -> str:
    no_backslashes = raw_url.strip().replace("\\", "").replace("%5C", "").replace("%5c", "")
    parsed = urlparse(no_backslashes)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("Invalid URL")
    return no_backslashes


def to_jina_url(url: str) -> str:
    without_protocol = re.sub(r"^https?://", "", url, flags=re.IGNORECASE)
    return f"https://r.jina.ai/http://{without_protocol}"


def extract_links_from_markdown(markdown: str, base_url: str) -> list[dict[str, str]]:
    link_regex = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
    seen: set[str] = set()
    links: list[dict[str, str]] = []

    for match in link_regex.finditer(markdown):
        content = (match.group(1) or "").strip()
        url = (match.group(2) or "").strip()
        if not url or url in seen:
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
        re.sub(r"\s+", " ",
            re.sub(r"\*\*|__|\*|_", "",
                re.sub(r"^#{1,6}\s+", "", 
                    re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1",
                        re.sub(r"!\[[^\]]*\]\([^)]*\)", " ",
                            re.sub(r"`([^`]+)`", r"\1",
                                re.sub(r"```[\s\S]*?```", " ", text)
                            )
                        )
                    ),
                    flags=re.MULTILINE,
                )
            )
        )
        .strip()
    )


def fallback_summary(text: str) -> str:
    collapsed = re.sub(r"\s+", " ", text).strip()
    if not collapsed:
        return "요약할 본문이 비어 있습니다."
    if len(collapsed) <= 500:
        return collapsed
    return f"{collapsed[:500]}..."


async def summarize_text(title: str, description: str, content: str) -> str:
    if _llm is None:
        return fallback_summary(f"{title}\n{description}\n{content}")

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

    completion = await _llm.chat.completions.create(
        model=settings.openai_model,
        temperature=0.2,
        messages=[{"role": "user", "content": prompt}],
    )
    return (completion.choices[0].message.content or "").strip()


async def ingest_url(raw_url: str) -> dict:
    url = normalize_url(raw_url)
    jina_url = to_jina_url(url)

    timeout_seconds = settings.jina_fetch_timeout_ms / 1000
    async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
        response = await client.get(jina_url, headers={"User-Agent": "snap-url-bot/0.1"})
    if response.status_code < 200 or response.status_code >= 300:
        raise RuntimeError(f"Jina fetch failed: {response.status_code} {response.reason_phrase}")

    markdown = response.text
    if not markdown or len(markdown.strip()) < 30:
        raise RuntimeError("Jina fetch returned empty markdown")

    title = first_non_empty_line(markdown).removeprefix("# ")[:180]
    plain = strip_markdown(markdown)

    extracted = {
        "title": title,
        "description": f"jina markdown mirror from {url}",
        "content": plain[:30000],
        "contentHtmls": [],
        "links": extract_links_from_markdown(markdown, url),
    }

    summary = await summarize_text(extracted["title"], extracted["description"], extracted["content"])

    row = db.upsert_document(
        {
            "url": url,
            "title": extracted["title"],
            "description": extracted["description"],
            "content": extracted["content"],
            "summary": summary,
            "links": extracted["links"],
        }
    )

    return {
        "id": row["id"],
        "url": url,
        "jinaUrl": jina_url,
        "fetchMode": "jina-markdown",
        "extracted": extracted,
        "summary": summary,
    }
