# ArchiveURL Frontend Spec

작성일: 2026-03-08  
대상: `frontend/`  
범위: iOS 앱, 인증 UX, 공유 시트, 문서 화면, 출시 전 프론트 작업

## 1. 개요

현재 프론트엔드는 Expo SDK 54 기반 iOS 앱이다.

핵심 기능:

- 이메일/비밀번호 로그인
- 이메일/비밀번호 회원가입 + 이메일 확인
- 비밀번호 재설정
- 홈에서 URL 수집 요청 생성
- 문서 목록/상세/수정/삭제
- iOS 공유 시트에서 바로 ingest 요청

핵심 파일:

- `frontend/src/navigation/RootNavigator.tsx`
- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/screens/SignInScreen.tsx`
- `frontend/src/screens/ResetPasswordScreen.tsx`
- `frontend/src/screens/HomeScreen.tsx`
- `frontend/src/screens/DocumentsScreen.tsx`
- `frontend/ios/SnapURLShare/ShareViewController.swift`

## 2. 인증 UX

현재 정책:

- 로그인: 이메일 + 비밀번호
- 회원가입: 이메일 + 비밀번호 + 이메일 확인 메일
- 비밀번호 재설정: 메일 링크 + 앱 내 새 비밀번호 설정
- 계정 삭제: soft delete
- 삭제 계정 로그인: 차단
- 삭제 계정 재가입: 같은 이메일 + 기존 비밀번호로 복구

주요 화면:

- `SignInScreen`
- `ResetPasswordScreen`

인증 완료 기준:

- Supabase 세션 존재만으로는 부족
- `/me` 성공 시에만 signedIn 상태로 전환

## 3. 내비게이션

구조:

- Stack
  - `SignIn`
  - `ResetPassword`
  - `Tabs`
  - `DocumentDetail`
  - `EditDocument`
- Bottom Tabs
  - `Home`
  - `Documents`

딥링크:

- `archiveurl://auth/callback`
- `archiveurl://auth/reset-password`
- `archiveurl://ingest-from-share`

## 4. 홈 화면

파일:

- `frontend/src/screens/HomeScreen.tsx`

기능:

- URL 입력
- 선택 메모 추가
- `POST /ingest`
- 진행 중 요청 / 최근 요청 표시
- 성공 시 문서 추가 또는 기존 문서 업데이트 안내
- 로그아웃
- 계정 삭제

현재 특성:

- ingest 상태는 폴링 기반
- 문서 중복 정책은 `같은 URL이면 update`

## 5. 문서 화면

파일:

- `frontend/src/screens/DocumentsScreen.tsx`
- `frontend/src/screens/DocumentDetailScreen.tsx`
- `frontend/src/screens/EditDocumentScreen.tsx`

기능:

- 카테고리 필터
- 검색
- 무한 스크롤
- 핀/언핀
- 삭제
- 수정

개수 표시 정책:

- 상단 숫자는 전체 문서 개수
- 실제 목록은 페이지 단위로 lazy load
- 검색/필터 중이면 `현재결과 / 전체개수`

## 6. iOS 공유 시트

현재 정책:

- Share Extension이 App Group에 저장된 access token / API base URL을 읽는다
- 가능하면 extension에서 바로 `POST /ingest`
- 인증 정보가 없거나 요청 실패 시에만 앱 열기 fallback

관련 파일:

- `frontend/ios/SnapURLShare/ShareViewController.swift`
- `frontend/ios/SnapURL/SharedIngestModule.m`
- `frontend/src/native/sharedIngest.ts`

현재 한계:

- Android 공유 인텐트 미지원
- 여러 URL 동시 공유 미지원
- extension 성공 시 앱 내 즉시 시각 피드백은 없음

## 7. 상태 관리

- 데이터 패칭: `@tanstack/react-query`
- 인증 상태: `AuthProvider`
- 네이티브 공유 브리지: `SharedIngestModule`

API URL 우선순위:

1. `EXPO_PUBLIC_API_BASE_URL`
2. Metro host 기반 추론
3. `http://localhost:3000`

실기기에서는 `.env` 설정이 필요하다.

## 8. 오류 처리

현재 정책:

- API 요청마다 `X-Request-Id` 전송
- 에러 메시지에 `오류 ID` 포함
- backend 로그의 request id와 바로 매칭 가능

인증 오류 UX:

- `invalid login credentials` 같은 원문 대신 사용자 친화적 문구 표시
- 삭제 계정이면 회원가입으로 복구 가능하다는 안내 표시

## 9. 출시 전 프론트 체크리스트

- [x] 로그인
- [x] 회원가입 + 이메일 확인
- [x] 비밀번호 재설정
- [x] 계정 삭제 진입
- [x] 삭제 계정 복구형 재가입
- [x] 문서 검색
- [x] iOS 공유 시트
- [x] 공유 시 직접 ingest fallback 구조
- [ ] 공유 시 성공/실패 사용자 피드백 polish
- [ ] 계정/설정 화면 분리
- [ ] Privacy Policy / Support 링크를 앱 내부에서 노출
- [ ] Release 빌드 기준 공유 시트 최종 검증
- [ ] TestFlight 메타데이터용 스크린샷 정리

## 10. 개발/실행 메모

주요 env:

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_DEV_AUTH_TOKEN`
- `EXPO_PUBLIC_DEV_AUTH_EMAIL`

iOS 네이티브 변경 후:

```bash
cd frontend/ios
pod install
cd ..
npx expo run:ios --device
```

## 11. 남은 프론트 우선순위

1. 공유 성공/실패 후 사용자 피드백 정리
2. 설정 화면 분리
3. Privacy Policy / Support 링크 노출
4. Sign in with Apple 검토
