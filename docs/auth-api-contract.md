# ArchiveURL 인증 API 계약

작성일: 2026-03-08  
대상: `frontend/`, `backend/`  
목표: 로그인 기반 멀티유저 전환에 필요한 인증/세션/API 계약을 정의한다.

## 1. 문서 목적

이 문서는 아래를 고정한다.

- 어떤 인증 헤더를 쓸지
- 앱이 어떤 순서로 세션을 복원할지
- 백엔드가 어떤 에러 코드를 줄지
- `/me` 계열 API를 어떻게 설계할지
- 기존 문서/ingest API가 인증 이후 어떻게 바뀌는지

이 문서는 프론트와 백엔드가 동시에 구현할 수 있게 만드는 계약 문서다.

## 2. 인증 전략

초기 기준:

- 외부 인증 공급자는 **Supabase Auth**
- 모바일 앱은 Supabase 세션을 가진다
- 앱 백엔드는 Supabase access token을 검증한다
- 현재 앱 UX는 `회원가입(이메일+비밀번호+이메일 확인)` / `로그인(이메일+비밀번호)` 로 분리한다

즉:

- 로그인 자체는 Supabase가 담당
- 서비스 권한과 사용자 데이터는 ArchiveURL API가 담당

## 3. 인증 헤더 규약

보호 API는 아래 헤더를 사용한다.

```http
Authorization: Bearer <access_token>
```

규칙:

- access token이 없으면 `401`
- 형식이 잘못되면 `401`
- 만료되었거나 검증 실패면 `401`
- 사용자는 존재하지만 비활성 상태면 `403`

## 4. 세션 모델

앱은 아래 세션 상태를 가진다.

```ts
type SessionState =
  | { status: "booting" }
  | { status: "signedOut" }
  | {
      status: "signedIn";
      accessToken: string;
      refreshToken?: string;
      user: SessionUser;
    };
```

`SessionUser`:

```ts
type SessionUser = {
  id: string;
  email: string;
  display_name: string | null;
  status: "active" | "disabled" | "deleted";
  created_at: string;
};
```

## 5. 앱 부트스트랩 흐름

앱 시작 시 순서:

1. 로컬 secure storage에서 세션 읽기
2. access token이 없으면 signedOut
3. access token이 있으면 `/me` 호출
4. `/me` 성공이면 signedIn
5. `/me`가 `401`이면 refresh 시도
6. refresh 성공이면 새 access token으로 `/me` 재호출
7. refresh도 실패하면 signedOut

중요:

- 앱의 “로그인 완료” 기준은 단순히 토큰 존재가 아니라 `/me` 성공이다

### 회원가입 계약

1. 앱은 Supabase `signUp(email, password)` 호출
2. 이메일 확인이 완료되기 전까지는 signedIn 으로 간주하지 않는다
3. 확인 링크로 앱 복귀 시 계정 확인 완료 상태만 표시한다
4. 이후 사용자는 같은 이메일/비밀번호로 로그인한다

### 비밀번호 재설정 계약

1. 앱은 Supabase `resetPasswordForEmail(email, { redirectTo })` 호출
2. 재설정 링크는 `archiveurl://auth/reset-password` 로 복귀한다
3. 앱은 recovery 세션을 감지하면 `새 비밀번호 설정` 화면을 연다
4. 새 비밀번호 저장은 Supabase `updateUser({ password })` 로 처리한다
5. 저장 후 `/me` 성공을 로그인 완료 기준으로 본다

## 6. 에러 응답 규약

기본 형식:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "retryable": false
  }
}
```

선택 필드:

```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Access token expired",
    "retryable": true
  }
}
```

### 공통 에러 코드

- `UNAUTHORIZED`
- `TOKEN_EXPIRED`
- `FORBIDDEN`
- `ACCOUNT_DISABLED`
- `ACCOUNT_DELETED`
- `INVALID_REQUEST_BODY`
- `INVALID_URL`
- `DOCUMENT_NOT_FOUND`
- `JOB_NOT_FOUND`
- `INTERNAL_ERROR`

### 상태 코드 규약

- `400`: 요청 형식 오류
- `401`: 인증 없음 또는 인증 실패
- `403`: 인증은 되었지만 권한 없음 또는 비활성 사용자
- `404`: 리소스 없음 또는 소유권 없는 리소스 접근
- `409`: 충돌
- `422`: 필요 시 도메인 검증 에러
- `500`: 내부 오류

권장 원칙:

- 타인 리소스 접근은 `403`보다 `404` 우선

이유:

- 리소스 존재 여부 노출을 줄일 수 있다

## 7. 인증 관련 API

Supabase가 로그인 자체를 담당하더라도, 앱 백엔드에는 사용자 컨텍스트 API가 필요하다.

## 7.1 `GET /me`

설명:

- 현재 인증된 사용자 정보를 반환
- 앱 세션 부트스트랩의 기준 API

요청:

```http
GET /me
Authorization: Bearer <access_token>
```

응답 `200`:

```json
{
  "user": {
    "id": "3c9c0b11-9a1d-4f29-9a1a-77c0f2c6e111",
    "email": "user@example.com",
    "display_name": "An",
    "status": "active",
    "created_at": "2026-03-08T00:00:00Z"
  }
}
```

실패:

- `401 UNAUTHORIZED`
- `401 TOKEN_EXPIRED`
- `403 ACCOUNT_DISABLED`
- `403 ACCOUNT_DELETED`

## 7.2 `PATCH /me`

설명:

- 현재 사용자 프로필 수정

요청 바디:

```json
{
  "display_name": "An"
}
```

응답 `200`:

```json
{
  "user": {
    "id": "3c9c0b11-9a1d-4f29-9a1a-77c0f2c6e111",
    "email": "user@example.com",
    "display_name": "An",
    "status": "active",
    "created_at": "2026-03-08T00:00:00Z"
  }
}
```

유효성:

- `display_name` 최소 1자
- 최대 길이 제한 필요

## 7.3 `DELETE /me`

설명:

- 현재 사용자 계정 삭제 요청

권장 동작:

- 즉시 hard delete보다 soft delete 우선
- 이후 비동기 삭제 작업으로 문서/작업 정리 가능
- 현재 ArchiveURL 구현은 `soft delete`를 사용하며, 동일한 이메일/인증 주체로 다시 로그인하면 계정과 기존 데이터가 복구된다

응답 `202`:

```json
{
  "result": {
    "status": "scheduled",
    "message": "Account deletion scheduled"
  }
}
```

삭제 후 클라이언트 동작:

- 로컬 세션 즉시 삭제
- 로그인 화면으로 이동

## 8. 기존 API 변경 계약

## 8.1 `POST /ingest`

변경점:

- 인증 필수
- 현재 사용자 기준으로 job 생성
- 중복 체크도 사용자 범위 안에서만 수행

요청:

```http
POST /ingest
Authorization: Bearer <access_token>
Idempotency-Key: 9f4a...
Content-Type: application/json
```

```json
{
  "url": "https://example.com",
  "description": "optional note"
}
```

응답 `202`:

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
    "created_at": "2026-03-08T00:00:00Z",
    "updated_at": "2026-03-08T00:00:00Z",
    "started_at": null,
    "finished_at": null
  },
  "links": {
    "self": "/ingest-jobs/1",
    "document": null
  }
}
```

실패:

- `400 INVALID_URL`
- `401 UNAUTHORIZED`

## 8.2 `GET /ingest-jobs`

변경점:

- 현재 사용자 작업만 반환

응답 `200`:

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
      "updated_at": "2026-03-08T00:00:10Z"
    }
  ]
}
```

## 8.3 `GET /ingest-jobs/:id`

변경점:

- 현재 사용자 소유 job만 조회 가능

실패:

- 타인 job 또는 없는 job 모두 `404 JOB_NOT_FOUND`

## 8.4 `GET /documents`

변경점:

- 현재 사용자 문서만 반환

응답 형식은 기존과 동일:

```json
{
  "items": [
    {
      "id": 10,
      "url": "https://example.com",
      "title": "Example",
      "description": "Description",
      "summary": "Summary",
      "category_key": "technology",
      "is_pinned": false,
      "created_at": "2026-03-08T00:00:00Z"
    }
  ]
}
```

## 8.5 `GET /documents/:id`

변경점:

- 현재 사용자 문서만 조회 가능
- 타인 문서 접근 시 `404 DOCUMENT_NOT_FOUND`

## 8.6 `PATCH /documents/:id`

변경점:

- 현재 사용자 문서만 수정 가능

## 8.7 `DELETE /documents/:id`

변경점:

- 현재 사용자 문서만 삭제 가능

## 8.8 `GET /categories`

공개 유지 가능

이유:

- 사용자 민감 정보가 아니다

## 9. 프론트엔드 계약

## 9.1 API 클라이언트 동작

[frontend/src/api/client.ts](/Users/anmunju/Documents/개발/archive-url/frontend/src/api/client.ts) 는 아래를 만족해야 한다.

- access token 자동 첨부
- `401 TOKEN_EXPIRED` 시 refresh 시도
- refresh 실패 시 sign-out
- `403 ACCOUNT_DISABLED` 또는 `403 ACCOUNT_DELETED` 시 강제 sign-out

권장 인터페이스:

```ts
apiFetch<T>(path: string, init?: RequestInit): Promise<T>
authFetch<T>(path: string, init?: RequestInit): Promise<T>
```

구분:

- `apiFetch`: 공개 API 가능
- `authFetch`: 보호 API 전용

## 9.2 로그인 화면 계약

로그인 화면은 최소 아래 상태를 처리해야 한다.

- 기본 입력 상태
- magic link 발송 중
- 발송 완료
- 에러 상태

필수 UX:

- 이메일 입력
- “로그인 링크 보내기”
- 링크 발송 성공 안내
- 앱 복귀 후 자동 세션 확인

## 9.3 공유 시트와 로그인 연계

로그인 전 공유 유입 시:

1. pending shared URL 저장
2. 로그인 화면 이동
3. 로그인 성공 후 pending URL 복원
4. ingest 화면 또는 홈 화면으로 전달

## 10. 백엔드 인증 처리 계약

## 10.1 인증 의존성

FastAPI 의존성 예시 개념:

```py
async def require_current_user(authorization: str = Header(...)) -> CurrentUser:
    ...
```

역할:

- Bearer 토큰 파싱
- 토큰 검증
- 내부 user upsert
- disabled/deleted 검사

## 10.2 내부 CurrentUser 구조

```py
class CurrentUser(TypedDict):
    id: str
    email: str
    auth_subject: str
    status: str
```

## 10.3 사용자 upsert 규칙

토큰 검증 성공 시:

1. `auth_subject`로 사용자 조회
2. 없으면 생성
3. 이메일/프로필 변경사항 반영
4. `deleted` 또는 `disabled`면 접근 차단

## 11. 보안 규약

- access token을 로그에 남기지 않는다
- refresh token은 앱 secure storage에만 둔다
- 계정 삭제 후 보호 API는 모두 차단한다
- 타인 데이터 존재 여부를 에러 메시지로 노출하지 않는다
- request id를 모든 에러 로그에 포함한다

## 12. 예시 타입 정의

프론트 공용 타입 예시:

```ts
export type ApiErrorBody = {
  error: {
    code:
      | "UNAUTHORIZED"
      | "TOKEN_EXPIRED"
      | "FORBIDDEN"
      | "ACCOUNT_DISABLED"
      | "ACCOUNT_DELETED"
      | "INVALID_REQUEST_BODY"
      | "INVALID_URL"
      | "DOCUMENT_NOT_FOUND"
      | "JOB_NOT_FOUND"
      | "INTERNAL_ERROR";
    message: string;
    retryable: boolean;
  };
};
```

## 13. 테스트 시나리오

필수 시나리오:

- 토큰 없이 `/me` 호출 -> `401`
- 만료 토큰으로 `/me` 호출 -> `401 TOKEN_EXPIRED`
- 활성 사용자 `/me` 호출 -> `200`
- 사용자 A가 사용자 B 문서 조회 -> `404`
- 로그인 전 공유 시트 진입 -> 로그인 후 pending URL 복구
- 계정 삭제 후 기존 토큰으로 보호 API 호출 -> `403 ACCOUNT_DELETED`

## 14. 완료 기준

아래가 충족되면 auth API 계약 구현 완료로 본다.

- 앱이 `/me` 기준으로 세션을 부트스트랩한다
- 보호 API는 모두 Bearer 토큰을 요구한다
- 문서/ingest 데이터가 사용자 기준으로 분리된다
- 토큰 만료/비활성 계정/삭제 계정이 명확히 처리된다
- 프론트와 백엔드의 에러 코드가 일치한다
