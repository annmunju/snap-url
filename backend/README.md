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
