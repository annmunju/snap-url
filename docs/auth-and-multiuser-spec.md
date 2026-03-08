# ArchiveURL 인증 및 멀티유저 전환 명세

작성일: 2026-03-08  
대상: `frontend/`, `backend/`  
목표: 현재 단일 사용자 구조를 로그인 기반 멀티유저 서비스 구조로 전환하기 위한 구현 명세를 정의한다.

## 1. 문서 목적

이 문서는 아래를 결정한다.

- 어떤 인증 방식을 쓸지
- 어떤 데이터 모델을 추가할지
- 기존 API를 어떻게 바꿀지
- 프론트 앱 구조를 어떻게 나눌지
- 어떤 순서로 마이그레이션할지

이 문서는 구현 시작용이다.  
즉, 이대로 작업 티켓을 쪼갤 수 있어야 한다.

## 2. 현재 상태 요약

현재 구조:

- 백엔드는 인증 없는 공개 API다
- 문서와 ingest job이 사용자와 연결되지 않는다
- 프론트는 로그인 상태 개념이 없다
- API 클라이언트는 토큰 저장/갱신이 없다

관련 파일:

- [backend/app/main.py](/Users/anmunju/Documents/개발/archive-url/backend/app/main.py)
- [backend/app/db.py](/Users/anmunju/Documents/개발/archive-url/backend/app/db.py)
- [backend/app/types.py](/Users/anmunju/Documents/개발/archive-url/backend/app/types.py)
- [frontend/src/api/client.ts](/Users/anmunju/Documents/개발/archive-url/frontend/src/api/client.ts)
- [frontend/src/api/types.ts](/Users/anmunju/Documents/개발/archive-url/frontend/src/api/types.ts)
- [frontend/src/navigation/RootNavigator.tsx](/Users/anmunju/Documents/개발/archive-url/frontend/src/navigation/RootNavigator.tsx)

## 3. 결정 사항

### 인증 방식

현재 구현 기준:

- **Supabase Auth 사용**
- 회원가입은 `이메일 + 비밀번호 + 이메일 확인`
- 로그인은 `이메일 + 비밀번호`
- 비밀번호 재설정은 `이메일 재설정 링크 + 앱 내 새 비밀번호 설정`
- 이후 필요 시 `Sign in with Apple` 추가

이유:

- 회원가입과 로그인을 분리하면 UX가 명확하다
- 로그인 단계에서 magic link 의존을 줄일 수 있다
- 비밀번호 재설정과 계정 복구 흐름을 앱 안에서 닫기 쉽다

### 백엔드 인증 모델

권장:

- 앱은 Supabase access token을 보낸다
- FastAPI는 매 요청마다 토큰 검증 후 `current_user`를 만든다
- 내부 DB에는 앱 자체 `users` 테이블을 유지한다

즉:

- 인증의 원천은 Supabase
- 서비스 데이터의 원천은 Postgres의 `users.id`

### 사용자 식별 원칙

- 외부 auth provider ID와 내부 user ID를 분리한다
- 내부 모든 테이블은 `user_id`를 FK로 가진다

## 4. 목표 사용자 흐름

### 가입

1. 앱 실행
2. 로그인 화면에서 `회원가입하기` 진입
3. 이메일 + 비밀번호 입력
4. 확인 메일 발송
5. 이메일 확인 링크 탭
6. 앱 복귀
7. 앱은 계정 확인 완료 상태를 표시
8. 같은 이메일 + 비밀번호로 로그인

### 로그인

1. 앱 실행
2. 로그인 화면 노출
3. 이메일 + 비밀번호 입력
4. Supabase 세션 획득
5. `/me` 성공 시 로그인 완료
6. 홈 화면 진입

### 비밀번호 재설정

1. 로그인 화면에서 `비밀번호를 잊으셨나요?`
2. 재설정 메일 발송
3. 메일 링크 탭
4. 앱이 `새 비밀번호 설정` 화면으로 복귀
5. 새 비밀번호 저장
6. `/me` 성공 시 로그인 완료

### 로그인 후 일반 사용

1. 사용자가 URL 입력 또는 공유 시트 진입
2. 앱이 인증 토큰을 포함해 API 호출
3. 서버는 현재 사용자 기준으로 ingest job 생성
4. 문서와 작업은 해당 사용자에게만 보임

### 계정 삭제

1. 설정 화면에서 계정 삭제 진입
2. 재확인
3. 서버에서 soft delete 수행
4. 로컬 세션 제거
5. 로그인 화면 복귀

현재 정책:

- 계정 삭제는 즉시 hard delete 하지 않는다
- 동일 이메일과 동일 Supabase 계정으로 다시 로그인하면 기존 계정과 문서를 복구한다

## 5. 데이터 모델 명세

## 5.1 users

```sql
users
- id uuid pk
- auth_provider text not null
- auth_subject text not null unique
- email text not null unique
- display_name text null
- avatar_url text null
- status text not null default 'active'
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
- deleted_at timestamptz null
```

설명:

- `auth_provider`: `supabase`
- `auth_subject`: 외부 auth 시스템의 사용자 식별자
- 내부 서비스 FK는 항상 `users.id` 사용

## 5.2 refresh_tokens 또는 sessions

Supabase를 쓰면 자체 refresh token 테이블은 필수는 아니다.  
하지만 앱 세션 감사 로그가 필요하면 별도 세션 테이블을 둔다.

권장:

```sql
user_sessions
- id uuid pk
- user_id uuid not null
- device_platform text not null
- device_name text null
- last_seen_at timestamptz not null default now()
- created_at timestamptz not null default now()
```

이 테이블은 인증의 진실 원천이 아니라 운영 분석용이다.

## 5.3 documents

기존 `documents` 확장:

```sql
documents
- id bigserial pk
- user_id uuid not null
- url text not null
- title text not null
- description text not null
- content text not null
- summary text not null
- category_key text not null
- is_pinned boolean not null default false
- links jsonb not null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
```

추가 제약:

- unique `(user_id, url)`

이유:

- 같은 URL을 사용자별로는 각각 저장 가능
- 같은 사용자는 같은 URL을 중복 저장하지 않음

## 5.4 ingest_jobs

기존 `ingest_jobs` 확장:

```sql
ingest_jobs
- id bigserial pk
- user_id uuid not null
- request_id uuid not null unique
- idempotency_key text null
- raw_url text not null
- normalized_url text null
- description text null
- status text not null
- attempt int not null default 0
- max_attempts int not null default 2
- error_code text null
- error_message text null
- document_id bigint null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
- started_at timestamptz null
- finished_at timestamptz null
```

추가 인덱스:

- index `(user_id, status, updated_at desc)`
- index `(user_id, normalized_url)`
- unique partial index on `(user_id, idempotency_key, normalized_url)` where `idempotency_key is not null`

## 5.5 audit_logs

```sql
audit_logs
- id bigserial pk
- user_id uuid null
- action text not null
- entity_type text not null
- entity_id text null
- metadata jsonb not null default '{}'
- created_at timestamptz not null default now()
```

용도:

- 계정 삭제
- 로그인 성공/실패
- 문서 삭제
- ingest 실패 추적

## 6. API 변경 명세

## 6.1 공통 규칙

모든 보호 API는 아래 헤더 필요:

```http
Authorization: Bearer <access_token>
```

서버 처리:

1. 토큰 검증
2. `auth_subject` 조회
3. 내부 `users` 레코드 upsert 또는 조회
4. `request.state.current_user` 주입

## 6.2 인증 관련 신규 API

Supabase를 쓰더라도 앱 백엔드에는 아래 API가 있으면 운영이 편하다.

### `GET /me`

응답:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "User",
    "status": "active",
    "created_at": "2026-03-08T00:00:00Z"
  }
}
```

용도:

- 앱 초기 부트스트랩
- 세션 유효성 확인

### `PATCH /me`

수정 가능:

- `display_name`

### `DELETE /me`

동작:

- 계정 삭제 요청
- 정책에 따라 soft delete
- 사용자 데이터 삭제 작업 enqueue 가능

## 6.3 기존 API 변경

### `POST /ingest`

변경:

- 인증 필수
- 생성되는 job에 `user_id` 기록
- 같은 URL 중복 체크도 `user_id` 범위에서만 수행

### `GET /ingest-jobs`

변경:

- 현재 사용자 job만 조회

### `GET /ingest-jobs/:id`

변경:

- 현재 사용자 소유 job만 조회 가능
- 타인 job 접근 시 `404` 또는 `403`

권장:

- 존재 여부 노출을 줄이기 위해 `404`

### `GET /documents`

변경:

- 현재 사용자 문서만 조회

### `GET /documents/:id`

변경:

- 현재 사용자 문서만 조회 가능

### `PATCH /documents/:id`

변경:

- 현재 사용자 문서만 수정 가능

### `DELETE /documents/:id`

변경:

- 현재 사용자 문서만 삭제 가능

### `GET /categories`

변경 없음

## 6.4 응답 타입 변경

권장 추가 필드:

- `owner_id`는 일반 응답에 노출하지 않는다
- 대신 서버 내부에서만 사용

이유:

- 클라이언트가 굳이 소유자 정보를 알 필요가 없다

## 7. 프론트엔드 구조 변경

## 7.1 네비게이션

현재:

- 단일 탭 구조

목표:

- `AuthStack`
- `AppStack`

예시:

```ts
type RootState =
  | { status: "booting" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: SessionUser };
```

권장 화면:

- Splash / Session bootstrap
- SignIn
- EmailLinkSent
- Home
- Documents
- DocumentDetail
- EditDocument
- Settings
- DeleteAccountConfirm

## 7.2 API 클라이언트

[frontend/src/api/client.ts](/Users/anmunju/Documents/개발/archive-url/frontend/src/api/client.ts) 변경 필요:

- access token 자동 첨부
- `401` 처리
- 세션 만료 시 sign-out
- base URL를 개발/스테이징/프로덕션으로 분리

권장 구조:

- `apiFetch`
- `authFetch`
- `sessionStore`

## 7.3 로컬 저장

권장:

- access token / refresh token은 secure storage 사용

iOS 기준:

- Expo SecureStore 또는 네이티브 Keychain

비권장:

- AsyncStorage에 토큰 저장

## 7.4 공유 시트 연동

공유 시트는 유지하되 아래가 추가되어야 한다.

- 로그인 안 된 상태에서 공유 시 로그인 유도
- 로그인 후 pending shared URL 복구
- 실패 시 재시도 UI

흐름:

1. 공유 시트로 URL 유입
2. 앱이 열림
3. 세션 확인
4. 로그인 필요하면 먼저 로그인
5. 로그인 완료 후 URL 소비
6. ingest 요청

## 8. 백엔드 구조 변경

## 8.1 인증 미들웨어

필요 기능:

- Bearer token 파싱
- 토큰 검증
- 사용자 조회 또는 생성
- 요청 컨텍스트에 현재 사용자 저장

권장 추가 모듈:

- `auth.py`
- `deps.py`
- `repositories/users.py`

## 8.2 저장소 계층 정리

현재 `db.py`에 로직이 많이 모여 있다.  
멀티유저 전환 후에는 최소한 아래로 나누는 편이 좋다.

- `repositories/users.py`
- `repositories/documents.py`
- `repositories/ingest_jobs.py`

이유:

- 권한 경계가 명확해진다
- 테스트 작성이 쉬워진다

## 8.3 워커

worker는 job을 처리할 때 `user_id`를 계속 유지해야 한다.

이유:

- 완료 시 문서를 어떤 사용자에게 귀속할지 결정해야 한다
- 실패 로그와 알림도 사용자 컨텍스트가 필요하다

## 9. 마이그레이션 계획

## Phase A. DB 준비

1. Postgres 도입
2. 새 스키마 작성
3. 마이그레이션 툴 도입

권장:

- Alembic

## Phase B. users 도입

1. `users` 테이블 추가
2. 기존 문서/작업 데이터는 임시 소유자에게 귀속
3. API 코드에 `current_user` 경로 추가

## Phase C. API 보호

1. `GET /categories`, `GET /health`만 공개 유지
2. 나머지 API는 인증 필수화
3. 소유자 필터 강제

## Phase D. 프론트 로그인 도입

1. 세션 bootstrap 구현
2. 로그인 화면 추가
3. 인증된 API 호출로 전환

## Phase E. 공유 시트 재정비

1. 비로그인 상태 처리
2. 로그인 후 pending URL 복원
3. ingest 재시도 UX 정리

## 10. 테스트 계획

## 10.1 백엔드

필수 테스트:

- 인증 없는 보호 API 호출 시 `401`
- 사용자 A 문서에 사용자 B 접근 불가
- `POST /ingest`가 현재 사용자 job으로 생성됨
- 중복 URL 체크가 사용자별로 독립 동작
- 계정 삭제 후 접근 차단

## 10.2 프론트

필수 테스트:

- 로그인 전엔 AppStack 접근 불가
- 로그인 성공 후 세션 복원 가능
- 토큰 만료 시 로그인 화면 복귀
- 공유 시트 -> 로그인 -> ingest 재개 가능

## 10.3 수동 QA

- 새 계정 가입
- 로그아웃 후 재로그인
- 두 계정 간 데이터 격리 확인
- 삭제 계정 재접속 차단 확인
- TestFlight 빌드에서 magic link 복귀 확인

## 11. 보안 체크리스트

- HTTPS 필수
- 프로덕션 비밀값은 배포 플랫폼 secret store 사용
- access token 로그 출력 금지
- 계정 삭제는 서버 기준으로 처리
- rate limiting 적용
- 요청 ID 로그화
- 민감 에러 메시지 외부 노출 금지

## 12. 구현 순서 제안

가장 현실적인 순서는 아래다.

1. Auth provider 확정
2. Postgres + migration 툴 도입
3. `users` 및 `user_id` 스키마 추가
4. 백엔드 인증 미들웨어 작성
5. 보호 API에 소유자 필터 추가
6. 프론트 session bootstrap + AuthStack 추가
7. 로그인 화면 추가
8. API client 인증 헤더 추가
9. 공유 시트 로그인 연동
10. 계정 삭제 및 설정 화면 추가

## 13. 출시 전 완료 기준

아래가 되면 인증/멀티유저 전환 완료로 본다.

- 로그인 없이는 문서 기능 사용 불가
- 각 사용자의 데이터가 완전히 분리됨
- 공유 시트가 로그인 상태와 연동됨
- 토큰 만료/로그아웃/계정 삭제가 정상 처리됨
- TestFlight 빌드에서 전체 흐름 검증 완료

## 14. 후속 문서 후보

이 문서 다음으로 필요한 건 아래다.

- `docs/postgres-migration-plan.md`
- `docs/auth-api-contract.md`
- `docs/app-store-launch-checklist.md`
- `docs/observability-and-ops-plan.md`
