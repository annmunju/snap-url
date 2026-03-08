# ARCHIVE-URL Backend API Spec (Current Implementation)

작성일: 2026-03-06  
대상 구현: `backend/` (Python + FastAPI + SQLite)

## 1. 개요
- URL 수집 요청은 `POST /ingest`로 생성하고, 백그라운드 워커가 비동기로 처리한다.
- 클라이언트는 `GET /ingest-jobs` 또는 `GET /ingest-jobs/:id`로 상태를 폴링한다.
- 완료 시 문서는 `documents` 리소스로 조회/수정/삭제한다.

## 2. 상태 모델
`ingest_jobs.status` 값:
- `queued`
- `running`
- `succeeded`
- `failed`

전이:
- `queued -> running -> succeeded`
- `queued -> running -> failed`
- 재시도 가능 오류는 `running -> queued` 후 재실행 (최대 `max_attempts`)

## 3. 엔드포인트

### `GET /health`
- 응답: `{ "status": "ok" }`

### `POST /ingest`
- 설명: ingest Job 생성 (`202 Accepted`)
- 요청 바디:
```json
{ "url": "https://example.com" }
```
- 선택 헤더: `Idempotency-Key`
- 응답 예시:
```json
{
  "job": {
    "id": 1,
    "request_id": "uuid",
    "raw_url": "https://example.com",
    "normalized_url": "https://example.com",
    "status": "queued",
    "attempt": 0,
    "max_attempts": 2,
    "error_code": null,
    "error_message": null,
    "document_id": null,
    "created_at": "2026-03-06 00:00:00",
    "updated_at": "2026-03-06 00:00:00",
    "started_at": null,
    "finished_at": null
  },
  "links": {
    "self": "/ingest-jobs/1",
    "document": null
  }
}
```

### `GET /ingest-jobs`
- 쿼리:
  - `limit` (기본 20, 1~100)
  - `status` (`queued|running|succeeded|failed`, 선택)
- 응답:
```json
{
  "items": [
    {
      "id": 1,
      "status": "running",
      "normalized_url": "https://example.com",
      "document_id": null,
      "error_code": null,
      "error_message": null,
      "updated_at": "2026-03-06 00:00:00"
    }
  ]
}
```

### `GET /ingest-jobs/:id`
- 응답:
```json
{
  "job": {
    "id": 1,
    "request_id": "uuid",
    "raw_url": "https://example.com",
    "normalized_url": "https://example.com",
    "status": "succeeded",
    "attempt": 1,
    "max_attempts": 2,
    "error_code": null,
    "error_message": null,
    "document_id": 10,
    "created_at": "2026-03-06 00:00:00",
    "updated_at": "2026-03-06 00:00:10",
    "started_at": "2026-03-06 00:00:01",
    "finished_at": "2026-03-06 00:00:10"
  },
  "links": {
    "document": "/documents/10"
  }
}
```

### `GET /documents`
- 쿼리:
  - `limit` (기본 20, 1~100)
  - `offset` (기본 0)
- 정렬: `is_pinned DESC, id DESC`
- 응답 아이템 필드:
  - `id, url, title, description, summary, category_key, is_pinned, created_at`

### `GET /documents/:id`
- 응답 필드:
  - `id, url, title, description, content, summary, category_key, is_pinned, links, created_at`

### `PATCH /documents/:id`
- 수정 가능 필드:
  - `title`
  - `description`
  - `links`
  - `is_pinned`
- 최소 1개 필드 필요

### `DELETE /documents/:id`
- 응답: `204 No Content`

### `GET /categories`
- 응답:
```json
{
  "items": [
    { "key": "technology", "label": "기술", "order": 1 }
  ]
}
```

## 4. 에러 규약
응답 형식:
```json
{
  "error": {
    "code": "INVALID_URL",
    "message": "Invalid URL",
    "retryable": false
  }
}
```

주요 코드:
- `INVALID_REQUEST_BODY`
- `INVALID_URL`
- `JOB_NOT_FOUND`
- `DOCUMENT_NOT_FOUND`
- `INTERNAL_ERROR`

## 5. 환경 변수
- `PORT` (기본 `3000`)
- `DB_PATH` (기본 `./data/archive-url.db`)
- `JINA_FETCH_TIMEOUT_MS` (기본 `20000`)
- `INGEST_CONCURRENCY` (기본 `1`)
- `OPENAI_API_KEY` (없으면 fallback summary)
- `OPENAI_MODEL` (기본 `gpt-4o-mini`)
