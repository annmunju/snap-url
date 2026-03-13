from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional


@dataclass(frozen=True)
class CategoryDef:
    key: str
    label: str
    order: int
    keywords: tuple[str, ...]
    enabled: bool = True


DEFAULT_CATEGORY_KEY = "uncategorized"

_BASE_CATEGORIES: tuple[CategoryDef, ...] = (
    CategoryDef(
        key="tech",
        label="기술",
        order=10,
        keywords=(
            "ai",
            "개발",
            "코드",
            "프로그래밍",
            "software",
            "engineering",
            "backend",
            "frontend",
            "tech",
            "api",
        ),
    ),
    CategoryDef(
        key="news",
        label="뉴스",
        order=20,
        keywords=(
            "news",
            "뉴스",
            "속보",
            "기사",
            "breaking",
            "headline",
            "press",
            "보도",
            "언론",
            "journal",
        ),
    ),
    CategoryDef(
        key="business",
        label="비즈니스",
        order=30,
        keywords=("biz", "business", "마케팅", "세일즈", "전략", "투자", "startup", "productivity"),
    ),
)

_DEFAULT_CATEGORY = CategoryDef(
    key=DEFAULT_CATEGORY_KEY,
    label="기타",
    order=9999,
    keywords=(),
)


def list_categories() -> list[dict[str, object]]:
    items = [item for item in _BASE_CATEGORIES if item.enabled]
    items.sort(key=lambda item: item.order)
    if all(item.key != DEFAULT_CATEGORY_KEY for item in items):
        items.append(_DEFAULT_CATEGORY)
    deduped: list[CategoryDef] = []
    seen: set[str] = set()
    for item in items:
        if item.key in seen:
            continue
        seen.add(item.key)
        deduped.append(item)
    return [{"key": item.key, "label": item.label, "order": item.order} for item in deduped]


def get_category_keys() -> list[str]:
    return [item["key"] for item in list_categories()]


def normalize_category_key(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_CATEGORY_KEY
    normalized = value.strip().lower()
    return normalized if normalized in set(get_category_keys()) else DEFAULT_CATEGORY_KEY


def _iter_matchable_categories() -> Iterable[CategoryDef]:
    for item in _BASE_CATEGORIES:
        if not item.enabled:
            continue
        if item.key == DEFAULT_CATEGORY_KEY:
            continue
        yield item


_NEWS_KEYWORDS: tuple[str, ...] = (
    "뉴스",
    "기사",
    "속보",
    "단독",
    "보도",
    "기자",
    "특파원",
    "연합뉴스",
    "로이터",
    "ap통신",
    "associated press",
    "press",
    "headline",
    "breaking",
    "입력",
    "수정",
)

_TECH_DEV_KEYWORDS: tuple[str, ...] = (
    "개발",
    "개발자",
    "프로그래밍",
    "코드",
    "리팩토링",
    "디버깅",
    "배포",
    "테스트",
    "아키텍처",
    "backend",
    "frontend",
    "fullstack",
    "devops",
    "sre",
    "api",
    "sdk",
    "framework",
    "library",
    "database",
    "sql",
    "python",
    "javascript",
    "typescript",
    "java",
    "kotlin",
    "swift",
    "rust",
    "go ",
    "react",
    "vue",
    "next.js",
    "node.js",
    "django",
    "fastapi",
    "spring",
)

_TECH_NON_DEV_KEYWORDS: tuple[str, ...] = (
    "반도체",
    "칩",
    "스마트폰",
    "전기차",
    "배터리",
    "가전",
    "우주",
    "바이오",
    "헬스케어",
    "신기술",
    "기술주",
)

_BUSINESS_KEYWORDS: tuple[str, ...] = (
    "비즈니스",
    "business",
    "시장",
    "매출",
    "수익",
    "실적",
    "투자",
    "벤처",
    "스타트업",
    "startup",
    "마케팅",
    "브랜딩",
    "세일즈",
    "영업",
    "유통",
    "전략",
    "경영",
    "기업",
    "ceo",
    "m&a",
    "인수",
    "합병",
)

_NEWS_URL_HINTS: tuple[str, ...] = ("news.", "/news", "/article", "/articles", "/press")
_BUSINESS_URL_HINTS: tuple[str, ...] = ("/business", "business.")


def _join_lower(*texts: str) -> str:
    return " ".join(texts).lower()


def _count_matches(value: str, keywords: tuple[str, ...]) -> int:
    matches = 0
    for keyword in keywords:
        normalized = keyword.lower()
        if len(normalized) <= 3 and normalized.isascii() and normalized.isalpha():
            if re.search(rf"\b{re.escape(normalized)}\b", value):
                matches += 1
            continue
        if normalized in value:
            matches += 1
    return matches


def _has_date_like_news_signal(value: str) -> bool:
    return bool(re.search(r"\b20\d{2}[./-]\d{1,2}[./-]\d{1,2}\b", value))


def is_news_like_content(*texts: str, source_url: Optional[str] = None) -> bool:
    value = _join_lower(*texts)
    url = (source_url or "").lower()
    score = _count_matches(value, _NEWS_KEYWORDS)
    if _has_date_like_news_signal(value):
        score += 1
    if any(hint in url for hint in _NEWS_URL_HINTS):
        score += 2
    return score >= 2


def is_dev_tech_content(*texts: str) -> bool:
    value = _join_lower(*texts)
    dev_score = _count_matches(value, _TECH_DEV_KEYWORDS)
    non_dev_score = _count_matches(value, _TECH_NON_DEV_KEYWORDS)
    return dev_score >= 2 and dev_score > non_dev_score


def is_business_content(*texts: str, source_url: Optional[str] = None) -> bool:
    value = _join_lower(*texts)
    url = (source_url or "").lower()
    score = _count_matches(value, _BUSINESS_KEYWORDS)
    if any(hint in url for hint in _BUSINESS_URL_HINTS):
        score += 1
    return score >= 2


def enforce_category_policy(candidate: Optional[str], *texts: str, source_url: Optional[str] = None) -> str:
    normalized = normalize_category_key(candidate)
    if normalized == DEFAULT_CATEGORY_KEY:
        return normalized

    if is_news_like_content(*texts, source_url=source_url):
        return "news"

    if normalized == "tech":
        return "tech" if is_dev_tech_content(*texts) else DEFAULT_CATEGORY_KEY

    if normalized == "business":
        return "business" if is_business_content(*texts, source_url=source_url) else DEFAULT_CATEGORY_KEY

    return normalized


def classify_category_key_with_confidence(*texts: str, source_url: Optional[str] = None) -> tuple[str, bool]:
    joined = _join_lower(*texts)

    if is_news_like_content(*texts, source_url=source_url):
        return ("news", True)

    if is_dev_tech_content(*texts):
        return ("tech", True)

    if is_business_content(*texts, source_url=source_url):
        return ("business", True)

    for item in _iter_matchable_categories():
        if any(keyword.lower() in joined for keyword in item.keywords):
            return (item.key, False)

    return (DEFAULT_CATEGORY_KEY, False)


def classify_category_key(*texts: str, source_url: Optional[str] = None) -> str:
    key, _ = classify_category_key_with_confidence(*texts, source_url=source_url)
    return key


def stable_category_fallback(*texts: str, source_url: Optional[str] = None) -> str:
    key = classify_category_key(*texts, source_url=source_url)
    return enforce_category_policy(key, *texts, source_url=source_url)
