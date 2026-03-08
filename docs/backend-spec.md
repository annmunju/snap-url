# ArchiveURL Backend Spec

작성일: 2026-03-08  
대상: `backend/`  
범위: FastAPI, Postgres, 인증, ingest 파이프라인, 운영 준비

## 1. 개요

현재 백엔드는 FastAPI + Postgres + Supabase Auth 검증 구조다.

핵심 기능:

- `/me` 기반 사용자 컨텍스트
- 사용자별 문서/ingest job 분리
- 비동기 ingest worker
- SQLite legacy 데이터 import
- request id 기반 에러 추적

핵심 파일:

- `backend/app/main.py`
- `backend/app/auth.py`
- `backend/app/repositories/users.py`
- `backend/app/repositories/documents.py`
- `backend/app/repositories/ingest_jobs.py`
- `backend/app/jobs.py`
- `backend/app/pipeline.py`
- `backend/alembic/versions/20260308_0001_create_multiuser_schema.py`

## 2. 아키텍처

인증:

- Supabase access token을 backend가 검증
- 내부 서비스 사용자 ID는 Postgres `users.id`

데이터:

- Postgres
- Alembic migration 관리

처리:

- `POST /ingest` -> job 생성
- worker가 queued/running/succeeded/failed 상태 전이
- 완료 시 `documents` upsert

## 3. 인증 모델

현재 정책:

- `/me` 성공이 로그인 완료 기준
- `users`는 `auth_subject`와 `email`로 연결
- 삭제 계정은 로그인 차단
- 삭제 계정은 `POST /me/reactivate`로만 복구

복구 정책:

- `DELETE /me` 는 soft delete
- 이후 동일 계정으로 로그인만 하면 차단
- 회원가입 흐름에서 기존 비밀번호 검증 후 `POST /me/reactivate` 호출 시 복구

관련 엔드포인트:

- `GET /me`
- `PATCH /me`
- `DELETE /me`
- `POST /me/reactivate`

## 4. 데이터 모델

핵심 테이블:

- `users`
- `user_sessions`
- `documents`
- `ingest_jobs`
- `audit_logs`

중요 제약:

- `documents`: unique `(user_id, url)`
- 같은 사용자가 같은 URL을 다시 저장하면 새 row가 아니라 update

## 5. 문서 API

주요 엔드포인트:

- `GET /documents`
- `GET /documents/:id`
- `PATCH /documents/:id`
- `DELETE /documents/:id`
- `GET /categories`

현재 `GET /documents` 응답:

- `items`
- `total`

의미:

- 프론트는 전체 개수와 현재 로드된 페이지를 분리해서 처리할 수 있다

## 6. ingest API

주요 엔드포인트:

- `POST /ingest`
- `GET /ingest-jobs`
- `GET /ingest-jobs/:id`

상태:

- `queued`
- `running`
- `succeeded`
- `failed`

특성:

- 사용자별 idempotency 처리
- 같은 URL 중복 요청 시 running job 재사용 가능
- retryable 오류는 재큐잉

## 7. request id / 로그

현재 정책:

- 모든 요청에 `X-Request-Id`
- 없으면 backend가 생성
- 응답 헤더에도 `X-Request-Id` 포함
- 에러 응답 바디에도 `request_id` 포함
- 서버 로그는 `[request_id=...]` 형식으로 남김

이유:

- 모바일 에러와 서버 로그를 빠르게 매칭하기 위해서

## 8. 환경 변수

핵심 env:

- `PORT`
- `DATABASE_URL`
- `SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE`
- `SUPABASE_URL`
- `SUPABASE_JWT_AUDIENCE`
- `SUPABASE_JWT_ISSUER` (필요 시)
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `INGEST_CONCURRENCY`
- `DEV_AUTH_TOKEN`
- `DEV_AUTH_EMAIL`

로딩 순서:

- `.env`
- `.env.{ENVIRONMENT}`
- `.env.local`
- `.env.{ENVIRONMENT}.local`

권장 구조:

- 개발: `ENVIRONMENT=development`
- 스테이징: `ENVIRONMENT=staging`
- 프로덕션: `ENVIRONMENT=production`

예시 파일:

- `backend/.env.example`
- `backend/.env.staging.example`
- `backend/.env.production.example`

## 9. 마이그레이션 / 데이터 이전

구현됨:

- Alembic 초기 세팅
- 멀티유저 스키마 migration
- SQLite -> Postgres import 스크립트

관련 파일:

- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/scripts/import_legacy_sqlite.py`

## 10. 운영 상태

이미 된 것:

- Postgres 전환
- Supabase JWT 검증
- 사용자별 문서/ingest 분리
- request id 추적
- 주요 사용자 액션 audit log 적재
- 선택적 monitoring hook

아직 필요한 것:

- [ ] production/staging 환경 분리 명확화
- [ ] HTTPS 고정 backend URL
- [ ] Sentry DSN 실제 연결
- [ ] backup 정책 문서화
- [ ] audit log 실제 적재 확대
- [ ] worker/queue 분리 고도화

## 11. rate limiting

현재 정책:

- `POST /ingest`: 기본 `20 requests / 60 seconds`
- 계정/문서 변경 API: 기본 `30 requests / 300 seconds`
- 기준 키는 `IP + user_id`
- 초과 시 `429 RATE_LIMIT_EXCEEDED`

관련 env:

- `INGEST_RATE_LIMIT_COUNT`
- `INGEST_RATE_LIMIT_WINDOW_SECONDS`
- `MUTATION_RATE_LIMIT_COUNT`
- `MUTATION_RATE_LIMIT_WINDOW_SECONDS`

## 12. 출시 전 백엔드 체크리스트

- [x] `/me` 기반 인증
- [x] 사용자별 문서 분리
- [x] 사용자별 ingest 분리
- [x] soft delete 계정 삭제
- [x] 삭제 계정 복구 API
- [x] request id 로그
- [x] Postgres + Alembic
- [x] 선택적 monitoring hook
- [ ] production deploy 고정
- [ ] monitoring service DSN 연결
- [ ] backup & restore runbook
- [ ] rate limiting 보강
- [ ] audit log 실제 활용

## 13. 남은 백엔드 우선순위

1. production/staging 배포 구조 정리
2. Sentry DSN 연결 및 alerting
3. backup 정책 정리
4. queue/worker 분리 고도화
5. audit log 활용 확대

## 14. staging / production 운용 규칙

기본 원칙:

- staging과 production은 서로 다른 Postgres DB를 사용
- Supabase 프로젝트도 가능하면 분리
- `DATABASE_URL`, `SUPABASE_URL`, `SENTRY_DSN` 은 환경별로 분리
- production에서는 `DEV_AUTH_*` 값을 비워 둔다

실행 예시:

```bash
cd backend
cp .env.production.example .env.production
ENVIRONMENT=production PYTHONPATH=backend ./.venv/bin/python run.py
```

## 15. Railway 배포 기준

현재 기준 파일:

- `railway.json`
- `backend/Dockerfile`
- `backend/scripts/railway-predeploy.sh`
- `backend/scripts/railway-start.sh`

배포 방식:

- Railway service는 repo root를 소스로 사용
- Dockerfile은 `backend/Dockerfile`
- pre-deploy는 `backend/scripts/railway-predeploy.sh`
- start는 `backend/scripts/railway-start.sh`
- healthcheck는 `/health`

필수 Railway 변수:

- `ENVIRONMENT=production`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_JWT_AUDIENCE=authenticated`
- `OPENAI_API_KEY` (필요 시)

권장:

- `DEV_AUTH_*` 는 production에서 비워 둔다
- `SENTRY_DSN` 은 붙일 때만 설정
