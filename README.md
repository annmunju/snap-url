# snap-url (Monorepo)

AI 기반 URL 수집/정리/요약 서비스 모노레포입니다.

## 디렉터리 구조
- `backend/`: Node.js + TypeScript API 서버
- `frontend/`: iOS/UI 클라이언트 작업 폴더
- `docs/`: 공통 문서 및 명세

## 현재 백엔드 기능
- URL 입력
- URL 정규화(깨진 백슬래시/인코딩 보정)
- `https://r.jina.ai/http://원본URL` 방식으로 마크다운 수집
- 수집된 마크다운에서 본문/링크 추출
- LangGraph 파이프라인으로 요약 생성
- SQLite DB에 원문 메타데이터 + 요약 + 링크 저장

## 백엔드 실행
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

## 백엔드 환경변수
- `OPENAI_API_KEY`: 설정 시 LLM 요약 사용
- `OPENAI_MODEL`: 기본 `gpt-4o-mini`
- `PORT`: 기본 `3000`
- `DB_PATH`: 기본 `./data/snap-url.db`
- `JINA_FETCH_TIMEOUT_MS`: 기본 `20000`

`OPENAI_API_KEY`가 없으면 fallback 요약(본문 축약)으로 동작합니다.

## 백엔드 API(현재 구현)
- `POST /ingest` (비동기 Job 생성, `202 Accepted`)
- `GET /ingest-jobs`
- `GET /ingest-jobs/:id`
- `GET /documents`
- `GET /documents/:id`
- `GET /health`

## 문서
- 비동기 ingest/status v1 명세: `docs/backend-async-ingest-spec-v1.md`
