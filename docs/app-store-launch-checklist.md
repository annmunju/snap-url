# ArchiveURL App Store 출시 체크리스트

작성일: 2026-03-08  
대상: `frontend/`, `backend/`, App Store Connect  
목표: ArchiveURL을 App Store에 제출하고 출시하기 전에 필요한 제품, 운영, 정책, 심사 준비 항목을 체크리스트로 정리한다.

## 1. 문서 목적

이 문서는 출시 직전 확인용이다.

범위:

- 제품 기능 준비
- 계정/개인정보 요구사항
- 백엔드 운영 준비
- TestFlight 준비
- App Store Connect 메타데이터 준비
- App Review 대응 준비

## 2. 출시 전 기본 원칙

출시 기준에서 아래가 모두 충족되어야 한다.

- 앱이 로그인/세션 상태를 안정적으로 처리한다
- 백엔드가 심사 기간 동안 계속 살아 있다
- 계정 생성이 있으면 앱 안에서 계정 삭제가 가능하다
- 개인정보처리방침이 앱 안과 App Store Connect 양쪽에 존재한다
- 심사자가 실제로 앱을 테스트할 수 있다

공식 참고:

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- 계정 삭제 요구사항: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- App information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- App privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- TestFlight: https://developer.apple.com/testflight/

## 3. 제품 체크리스트

## 3.1 인증/계정

- [ ] 회원가입 또는 로그인 흐름이 실제 기기에서 동작한다
- [ ] 회원가입 이메일 확인 후 로그인 흐름이 실제 기기에서 동작한다
- [ ] 비밀번호 재설정 메일 발송과 앱 복귀가 실제 기기에서 동작한다
- [ ] 로그인 후 앱 재실행 시 세션이 복원된다
- [ ] 로그아웃이 정상 동작한다
- [ ] 계정 삭제 기능이 앱 안에서 시작 가능하다
- [ ] 계정 삭제 후 세션이 즉시 제거된다
- [ ] 삭제된 계정으로 보호 API 접근 시 차단된다
- [ ] 비활성/차단 계정 처리 UX가 있다

주의:

- Apple은 계정 생성이 있는 앱이면 앱 안에서 계정 삭제 시작 기능을 요구한다
- 웹으로만 보내서 삭제하게 하면 심사 지연 가능성이 크다

## 3.2 핵심 기능

- [ ] URL 입력으로 ingest 요청 가능
- [ ] 공유 시트에서 URL 유입 가능
- [ ] ingest 상태가 queued/running/succeeded/failed 로 보인다
- [ ] 문서 목록 조회 가능
- [ ] 문서 상세 조회 가능
- [ ] 문서 수정 가능
- [ ] 문서 삭제 가능
- [ ] 실패한 요청 재시도 UX가 있다

## 3.3 앱 품질

- [ ] cold start 에서 크래시가 없다
- [ ] 로그인 전/후 화면 전환이 자연스럽다
- [ ] 로딩/에러/빈 상태가 준비되어 있다
- [ ] 네트워크 실패 메시지가 사용자에게 이해 가능하다
- [ ] iPhone 실기기에서 레이아웃이 깨지지 않는다
- [ ] 다크모드 정책이 있다
- [ ] 접근성 기본 수준을 충족한다

## 4. 백엔드 운영 체크리스트

- [ ] 프로덕션 백엔드 URL이 고정되어 있다
- [ ] HTTPS가 적용되어 있다
- [ ] 프로덕션 DB가 분리되어 있다
- [ ] 백업 정책이 있다
- [ ] 장애 로그를 확인할 수 있다
- [ ] request id 또는 trace id 기반 로그 추적이 가능하다
- [ ] 심사 기간 동안 서버를 꺼두지 않는다
- [ ] staging 과 production 환경이 분리되어 있다
- [ ] 비밀값은 secret manager 또는 배포 플랫폼 환경변수로 관리한다

필수 확인:

- 심사자가 테스트할 때 서버가 내려가 있으면 바로 리젝 또는 추가 질의 가능성이 높다

## 5. 개인정보 및 정책 체크리스트

## 5.1 개인정보처리방침

- [ ] 공개 URL이 있다
- [ ] App Store Connect 에 입력했다
- [ ] 앱 내부에서도 접근 가능하다
- [ ] 어떤 데이터를 수집하는지 명시했다
- [ ] 데이터 사용 목적을 명시했다
- [ ] 제3자 서비스 사용 여부를 명시했다
- [ ] 보관/삭제 정책을 명시했다
- [ ] 계정 삭제 또는 데이터 삭제 방법을 명시했다

## 5.2 App Privacy 응답

- [ ] App Store Connect 의 App Privacy 질문에 응답했다
- [ ] 앱이 수집하는 데이터 유형을 정리했다
- [ ] 인증/분석/에러 추적 SDK의 데이터 수집도 포함했다
- [ ] 실제 앱 동작과 제출 응답이 일치한다

주의:

- Apple은 서드파티 SDK가 수집하는 데이터도 포함해서 응답하라고 안내한다

## 5.3 이용약관

- [ ] 필요 시 서비스 이용약관 URL이 있다
- [ ] 앱 또는 웹에서 접근 가능하다

## 6. 앱 바이너리 체크리스트

## 6.1 iOS 설정

- [ ] `bundleIdentifier` 최종 확정
- [ ] 앱 이름 최종 확정
- [ ] 앱 아이콘 최종 반영
- [ ] 버전(`version`)과 빌드 번호(`buildNumber`) 관리 방식 정리
- [ ] 권한 사용 문구가 필요한 경우 모두 작성
- [ ] Privacy Manifest 검토
- [ ] Share Extension 포함 빌드가 정상 설치된다

관련 파일:

- [frontend/app.json](/Users/anmunju/Documents/개발/archive-url/frontend/app.json)
- [frontend/ios/SnapURL/Info.plist](/Users/anmunju/Documents/개발/archive-url/frontend/ios/SnapURL/Info.plist)
- [frontend/ios/SnapURL/PrivacyInfo.xcprivacy](/Users/anmunju/Documents/개발/archive-url/frontend/ios/SnapURL/PrivacyInfo.xcprivacy)

## 6.2 딥링크/링크

- [ ] custom URL scheme 동작 확인
- [ ] Universal Links 도입 시 production domain 과 연동 확인
- [ ] 회원가입 이메일 확인 복귀가 실기기에서 동작한다
- [ ] 비밀번호 재설정 복귀가 실기기에서 동작한다
- [ ] 공유 시트 -> 앱 복귀 흐름이 안정적이다

## 7. TestFlight 체크리스트

- [ ] 내부 테스터 빌드 업로드 성공
- [ ] 내부 테스터에서 로그인 가능
- [ ] 내부 테스터에서 ingest 전체 흐름 가능
- [ ] 공유 시트 포함 기능 검증 완료
- [ ] 크래시/치명 오류 수정 완료
- [ ] 외부 테스터용 노트 작성

공식 참고:

- TestFlight는 내부 테스터 최대 100명, 외부 테스터 최대 10,000명까지 지원한다고 Apple이 안내한다

## 8. App Store Connect 메타데이터 체크리스트

- [ ] App Name
- [ ] Subtitle
- [ ] Description
- [ ] Keywords
- [ ] Category
- [ ] Privacy Policy URL
- [ ] Support URL
- [ ] Marketing URL 필요 시 작성
- [ ] 스크린샷 준비
- [ ] App Preview 필요 시 준비
- [ ] 연령 등급 질문 응답
- [ ] App Privacy 응답

공식 참고:

- Apple은 iOS 앱의 Privacy Policy URL 입력을 요구한다
- 앱 이름은 최소 2자, 최대 30자 제한이 있다

## 9. 스크린샷 준비 체크리스트

- [ ] 로그인 화면
- [ ] 홈 화면
- [ ] 문서 목록 화면
- [ ] 문서 상세 화면
- [ ] 공유 시트 사용 후 결과 화면

원칙:

- 실제 기능을 보여줘야 한다
- 아직 없는 기능을 과장하면 안 된다
- UI가 테스트 계정 데이터와 일치해야 한다

## 10. 리뷰 제출 체크리스트

- [ ] 리뷰 노트 작성
- [ ] 테스트 계정 제공 또는 리뷰 가능한 서버 상태 유지
- [ ] 로그인 절차 설명 작성
- [ ] 특수 기능 설명 작성
- [ ] 공유 시트 테스트 방법 설명 작성
- [ ] 계정 삭제 위치 설명 작성
- [ ] 백엔드 의존 기능 설명 작성

리뷰 노트에 포함할 것:

- 테스트용 이메일 계정
- 필요한 경우 1회용 코드 수신 방법
- magic link 기반이면 테스트 절차 상세 설명
- 서버가 특정 국가 또는 특정 환경에서만 동작하면 그 조건

## 11. 리젝 방지 체크리스트

- [ ] 로그인 기능이 실제로 작동한다
- [ ] 데모 계정 또는 리뷰 계정을 제공한다
- [ ] 계정 생성 앱이면 계정 삭제가 앱 안에 있다
- [ ] 개인정보처리방침 링크가 앱 안과 메타데이터에 있다
- [ ] 크래시가 없다
- [ ] placeholder 데이터나 미완성 문구가 없다
- [ ] 죽은 버튼이 없다
- [ ] 외부 웹으로만 필수 흐름을 넘기지 않는다
- [ ] 서버 오류가 빈번하지 않다

## 12. 출시 당일 체크리스트

- [ ] 프로덕션 서버 상태 정상
- [ ] DB 백업 완료
- [ ] 에러 추적 도구 켜짐
- [ ] 최신 빌드 상태 확인
- [ ] 출시 국가 설정 확인
- [ ] 지원 이메일 확인
- [ ] 개인정보처리방침 URL 정상 응답 확인
- [ ] 계정 삭제 플로우 재점검

## 13. 출시 후 72시간 체크리스트

- [ ] 크래시 리포트 확인
- [ ] 로그인 실패율 확인
- [ ] ingest 실패율 확인
- [ ] 문서 생성 성공률 확인
- [ ] 서버 응답시간 확인
- [ ] 리뷰/문의 채널 확인
- [ ] 심사 중 문의 답변 기록 정리

## 14. ArchiveURL 전용 추가 체크

이 프로젝트 특성상 아래를 추가 확인해야 한다.

- [ ] 공유 시트 타겟이 Release 빌드에서 정상 노출된다
- [ ] 로그인 안 된 상태의 shared URL 처리 방식이 명확하다
- [ ] 로그인 후 pending shared URL 복원이 된다
- [ ] 동일 URL 반복 제출 시 중복 처리 정책이 일관적이다
- [ ] 요약/분류 실패 시 사용자 메시지가 이해 가능하다
- [ ] OpenAI 의존 기능 실패 시 fallback 이 있다

## 15. 출시 가능 판정

아래가 모두 체크되면 출시 가능 상태로 본다.

- 제품 핵심 기능 완료
- 인증/계정 삭제 완료
- 개인정보/정책 문서 완료
- 프로덕션 서버 안정화 완료
- TestFlight 베타 검증 완료
- App Store Connect 메타데이터 완료
- 리뷰 노트와 테스트 계정 준비 완료
