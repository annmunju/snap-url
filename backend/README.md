# ARCHIVE-URL Python backend

Node/TypeScript 백엔드와 동일한 API 계약을 목표로 한 Python 포트입니다.

## 실행

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

환경별 실행:

```bash
cp .env.staging.example .env.staging
ENVIRONMENT=staging python run.py
```

## Railway 배포

현재 저장소에는 Railway 배포용 파일이 포함되어 있다.

- `railway.json`
- `backend/Dockerfile`
- `backend/scripts/railway-predeploy.sh`
- `backend/scripts/railway-start.sh`

권장 설정:

- Source repo root: repository root
- Config as code: root `railway.json`
- Dockerfile: `backend/Dockerfile`
- Start command: `backend/scripts/railway-start.sh`
- Pre-deploy command: `backend/scripts/railway-predeploy.sh`

필수 Railway 변수:

- `ENVIRONMENT=production`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_JWT_AUDIENCE=authenticated`
- `OPENAI_API_KEY` (필요 시)

프론트 production env:

- `EXPO_PUBLIC_API_BASE_URL=https://<your-service>.up.railway.app`

## 엔드포인트

- `GET /health`
- `POST /ingest`
- `GET /ingest-jobs`
- `GET /ingest-jobs/:id`
- `GET /documents`
- `GET /documents/:id`
- `PATCH /documents/:id`
- `DELETE /documents/:id`

## 환경변수

- `PORT` (default: `3000`)
- `DB_PATH` (default: `./data/archive-url.db`)
- `JINA_FETCH_TIMEOUT_MS` (default: `20000`)
- `INGEST_CONCURRENCY` (default: `1`)
- `OPENAI_API_KEY` (없으면 fallback summary)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

로딩 순서:

- `.env`
- `.env.{ENVIRONMENT}`
- `.env.local`
- `.env.{ENVIRONMENT}.local`
