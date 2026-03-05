# Snap URL Backend Spec v1 (Async Ingest/Status)

작성일: 2026-03-05  
대상 서비스: `snap-url` (Node.js + Express + SQLite)

## 1) 목적
- `POST /ingest`를 비동기 작업(Job) 생성 API로 전환한다.
- 클라이언트(iOS)는 Job 상태를 폴링해서 완료 시 문서를 조회한다.
- 기존 문서 조회 API(`GET /documents`, `GET /documents/:id`)는 유지한다.

## 2) 범위
### 포함
- 비동기 Job 생성/조회 API
- Job 상태 모델 및 전이 규칙
- DB 스키마(ingest_jobs) 추가
- 실패 사유/재시도/타임아웃 정책

### 제외(다음 단계)
- 푸시 알림
- 웹소켓/SSE 실시간 스트리밍
- 분산 큐(Redis, SQS 등) 도입

## 3) 상태 모델
`status` 값:
- `queued`: 작업 생성됨, 아직 실행 전
- `running`: 파이프라인 실행 중
- `succeeded`: 성공, `document_id` 확정
- `failed`: 실패, `error_code`/`error_message` 기록

상태 전이:
1. `queued -> running`
2. `running -> succeeded | failed`
3. `queued -> failed` (사전 검증 실패 시)

종료 상태:
- `succeeded`, `failed`

## 4) 리소스 모델
### IngestJob
```json
{
  "id": 101,
  "request_id": "9d42233a-f2a6-4f1a-9cf8-336f6f236f4f",
  "raw_url": "https://example.com",
  "normalized_url": "https://example.com/",
  "status": "running",
  "attempt": 1,
  "max_attempts": 2,
  "error_code": null,
  "error_message": null,
  "document_id": null,
  "created_at": "2026-03-05T09:00:00.000Z",
  "updated_at": "2026-03-05T09:00:02.000Z",
  "started_at": "2026-03-05T09:00:01.000Z",
  "finished_at": null
}
```

## 5) API 명세

## 5.1 `POST /ingest`
비동기 ingest Job 생성.

Request:
```json
{
  "url": "https://example.com/article"
}
```

Headers(선택):
- `Idempotency-Key`: 동일 요청 중복 생성 방지용 키 (권장)

Response: `202 Accepted`
```json
{
  "job": {
    "id": 101,
    "status": "queued",
    "raw_url": "https://example.com/article",
    "normalized_url": "https://example.com/article",
    "document_id": null,
    "error_code": null,
    "error_message": null,
    "created_at": "2026-03-05T09:00:00.000Z",
    "updated_at": "2026-03-05T09:00:00.000Z"
  },
  "links": {
    "self": "/ingest-jobs/101",
    "document": null
  }
}
```

Validation 실패: `400 Bad Request`
- `INVALID_REQUEST_BODY`
- `INVALID_URL`

## 5.2 `GET /ingest-jobs/:id`
Job 상태 조회.

Response: `200 OK`
```json
{
  "job": {
    "id": 101,
    "status": "succeeded",
    "raw_url": "https://example.com/article",
    "normalized_url": "https://example.com/article",
    "document_id": 55,
    "error_code": null,
    "error_message": null,
    "attempt": 1,
    "max_attempts": 2,
    "created_at": "2026-03-05T09:00:00.000Z",
    "updated_at": "2026-03-05T09:00:06.000Z",
    "started_at": "2026-03-05T09:00:01.000Z",
    "finished_at": "2026-03-05T09:00:06.000Z"
  },
  "links": {
    "document": "/documents/55"
  }
}
```

Not found: `404 Not Found`
- `JOB_NOT_FOUND`

## 5.3 `GET /ingest-jobs`
최근 Job 목록 조회 (운영/디버깅용).

Query:
- `limit` (기본 20, 최대 100)
- `status` (`queued|running|succeeded|failed`, 선택)

Response: `200 OK`
```json
{
  "items": [
    {
      "id": 101,
      "status": "running",
      "normalized_url": "https://example.com/article",
      "document_id": null,
      "updated_at": "2026-03-05T09:00:02.000Z"
    }
  ]
}
```

## 5.4 기존 API 유지
- `GET /documents?limit=20`
- `GET /documents/:id`
- `GET /health`

## 6) 에러 규약
공통 포맷:
```json
{
  "error": {
    "code": "JINA_FETCH_FAILED",
    "message": "Jina fetch failed: 522",
    "retryable": true
  }
}
```

대표 `error.code`:
- `INVALID_REQUEST_BODY`
- `INVALID_URL`
- `JOB_NOT_FOUND`
- `NORMALIZE_FAILED`
- `JINA_FETCH_FAILED`
- `EXTRACT_FAILED`
- `SUMMARIZE_FAILED`
- `PERSIST_FAILED`
- `INTERNAL_ERROR`

## 7) DB 스키마
기존 `documents` 유지 + 신규 `ingest_jobs`.

```sql
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT,
  raw_url TEXT NOT NULL,
  normalized_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  error_code TEXT,
  error_message TEXT,
  document_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  finished_at DATETIME,
  FOREIGN KEY(document_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status_updated_at
  ON ingest_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_normalized_url
  ON ingest_jobs(normalized_url);
```

중복 요청 정책:
- 같은 `Idempotency-Key` + 같은 URL이면 기존 Job 반환(새 Job 미생성).
- 같은 URL의 `running` Job이 있으면 해당 Job 재사용 가능(옵션, v1 권장).

## 8) 실행 모델(v1)
- 앱 프로세스 내 메모리 큐(in-process worker) 1개로 시작.
- 서버 시작 시 `queued/running` 잔여 Job을 스캔:
  - `running`은 `queued`로 되돌린 뒤 재처리
  - `attempt < max_attempts` 인 Job만 재시도
- 동시 처리 수 기본 1 (환경변수로 확장 가능: `INGEST_CONCURRENCY`)

## 9) 재시도/타임아웃 정책
- 기본 `max_attempts = 2`
- 재시도 대상: 네트워크성 오류(`JINA_FETCH_FAILED`, 일부 `SUMMARIZE_FAILED`)
- 재시도 비대상: 입력 검증 오류(`INVALID_URL` 등)
- Jina fetch timeout: 기존 `JINA_FETCH_TIMEOUT_MS` 사용

## 10) iOS 클라이언트 연동 규칙
1. URL 제출: `POST /ingest` 호출
2. `job.id` 수신 후 1-2초 간격 폴링: `GET /ingest-jobs/:id`
3. `succeeded`이면 `document_id`로 `GET /documents/:id` 조회
4. `failed`이면 `error.code` 기준 재시도 UX 제공

권장 폴링:
- 1~5회: 1초
- 6~15회: 2초
- 이후: 3초 (최대 60초)

## 11) 하위호환/마이그레이션
- 기존 동기 `/ingest` 응답은 v1에서 제거하고 `202 + job`으로 통일.
- 단기 호환이 필요하면 임시로 `POST /ingest-sync`를 내부/개발용으로 유지 가능.

## 12) 완료 기준 (Definition of Done)
- `POST /ingest`가 항상 `202`와 Job 리소스를 반환
- `GET /ingest-jobs/:id`로 상태 추적 가능
- 성공 시 `document_id`가 연결되고 기존 문서 조회 API와 연동됨
- 실패 시 에러 코드/메시지 저장 및 반환
- 서버 재시작 후 미완료 Job 복구 동작
