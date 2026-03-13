from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from time import time
from typing import Deque

from fastapi import Request


@dataclass
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int


class RateLimitExceededError(Exception):
    def __init__(self, rule: RateLimitRule, retry_after_seconds: int):
        self.rule = rule
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"Rate limit exceeded for {rule.name}")


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, *, key: str, rule: RateLimitRule) -> None:
        now = time()
        window_start = now - rule.window_seconds

        with self._lock:
            bucket = self._events[f"{rule.name}:{key}"]
            while bucket and bucket[0] < window_start:
                bucket.popleft()

            if len(bucket) >= rule.limit:
                retry_after_seconds = max(1, int(bucket[0] + rule.window_seconds - now))
                raise RateLimitExceededError(rule, retry_after_seconds)

            bucket.append(now)


rate_limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"
