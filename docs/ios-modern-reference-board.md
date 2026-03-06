# Modern App Reference Board (Revised)

작성일: 2026-03-06  
대상: `Snap URL` iPhone 앱 UI 재정비  
목표: 현재 정보 구조는 유지하고, 시각 톤을 더 세련되고 덜 답답하게 바꾼다.

## 1. 방향 수정

이전 방향은 `Apple 기본 앱과 유사한 안전한 iOS 스타일`에 치우쳐 있었다.  
문제는 다음과 같다.

- 너무 기본 앱처럼 보여 제품 개성이 약하다.
- 화면 밀도가 높아 보일 때 여백이 답답하게 느껴진다.
- 카드, 버튼, 탭이 모두 비슷한 무게로 보여 핵심 시선이 분산된다.

새 방향은 `Apple 네이티브 규칙`은 유지하되, 레퍼런스는 `현대 생산성 앱`으로 옮긴다.

핵심 키워드:
- `Quiet`
- `Editorial`
- `Lightweight`
- `Confident`
- `Less chrome, more content`

## 2. 우선 참고할 공식 기준

1. Apple Human Interface Guidelines  
링크: https://developer.apple.com/design/human-interface-guidelines/  
이유: iPhone UI 기본 규칙, 터치 타겟, hierarchy 기준 유지용

2. Apple Design Tips  
링크: https://developer.apple.com/design/tips/  
이유: 간격, 대비, 가독성에서 과한 커스텀을 방지하는 안전장치

## 3. 새 레퍼런스 후보

### A. Linear

1. Linear for Agents  
링크: https://linear.app/mobile  
볼 것:
- 화면 요소 수를 줄이고 핵심 액션만 남기는 방식
- 리스트와 상세의 무게 차이를 명확히 두는 레이아웃
- 밝은 배경에서도 선명하게 보이는 타이포 대비

2. Linear Blog, Liquid glass without the glass  
링크: https://linear.app/blog/liquid-glass-without-the-glass  
볼 것:
- 과한 유리 효과 없이도 레이어를 구분하는 방법
- 반투명 대신 색상, blur 절제, spacing으로 위계를 만드는 방식

적용 포인트:
- `Snap URL`은 홈 화면을 카드 갤러리처럼 만들 필요가 없다.
- 입력창, CTA, 진행 현황 세 덩어리만 강하게 분리하면 충분하다.

### B. Craft

1. Craft iOS app  
링크: https://www.craft.do/  
볼 것:
- 텍스트 중심이지만 차갑지 않은 화면 밀도
- 큰 헤더와 넉넉한 여백을 써도 지루하지 않게 만드는 방식
- 카드가 많아도 화면이 무겁지 않게 보이는 톤

적용 포인트:
- 타이틀은 지금보다 더 숨 쉴 공간을 줘도 된다.
- 카드 테두리보다 배경 톤과 내부 여백으로 구분하는 편이 맞다.

### C. Bear

1. Bear  
링크: https://bear.app/  
볼 것:
- 편집기/노트형 앱에서 쓰는 조용한 중성 색상
- 검은색이 아닌 짙은 회색 본문 텍스트
- 보조 정보의 존재감은 낮추되 읽히는 수준은 유지하는 균형

적용 포인트:
- `textPrimary`, `textSecondary`, `border`를 더 섬세하게 나눠야 한다.
- 상태 목록에서 메타 정보는 더 조용하게 눌러도 된다.

### D. Notion Calendar

1. Notion Calendar  
링크: https://www.notion.com/product/calendar  
볼 것:
- 시선이 한 번에 어디로 가야 하는지 명확한 구조
- 브랜드 색을 넓게 쓰지 않고 포인트만 주는 방식
- 배경과 surface를 미묘하게 분리하는 색상 운용

적용 포인트:
- `primary`는 버튼과 활성 상태에만 쓰고 나머지는 중립색으로 버텨야 한다.
- 배지, 보더, 탭 inactive까지 포인트 컬러가 번지면 안 된다.

### E. Things

1. Things  
링크: https://culturedcode.com/things/  
볼 것:
- 할 일 앱인데도 정보가 답답하지 않은 vertical rhythm
- 리스트 아이템마다 동일한 무게를 주지 않고 중요도 차이를 만드는 방식
- 손에 잘 맞는 iPhone 레이아웃 비례

적용 포인트:
- 진행 현황 아이템의 높이와 내부 간격을 더 안정적으로 잡는 데 참고하기 좋다.
- 작은 배지보다 줄 간격과 텍스트 계층으로 읽기 흐름을 만드는 편이 낫다.

## 4. Snap URL에 맞는 추천 조합

현재 앱에는 아래 조합이 가장 적합하다.

1. 구조: `Linear`
2. 색감: `Bear`
3. 여백 리듬: `Things`
4. 버튼/포인트 컬러 절제: `Notion Calendar`

정리하면:
- Apple 기본 앱처럼 보이되 더 현대적이어야 한다.
- 카드 수를 늘리지 말고 레이어 수를 줄여야 한다.
- 포인트 컬러는 적게 쓰고, 대신 타이포 위계와 spacing으로 완성해야 한다.

## 5. 바로 버려야 할 방향

- 모든 섹션을 둥근 카드로 감싸는 방식
- inactive 탭도 존재감이 강한 방식
- 두꺼운 border로 구분하는 방식
- CTA 버튼과 입력창이 같은 높이, 같은 무게로 붙어 있는 방식
- 상태 배지를 너무 진하고 작게 써서 오히려 복잡해 보이는 방식

## 6. 다음 시안 원칙

### 홈 화면
- 상단 타이틀은 더 크고 더 여유 있게
- 입력창은 얇고 길게
- CTA는 지금보다 조금 낮고 조금 넓게
- 진행 현황은 `카드 리스트`보다 `정돈된 activity block`처럼 보이게

### 문서 화면
- 카드 나열형보다 `list-first` 접근 우선
- 카테고리 칩은 크기와 대비를 모두 낮춰 보조 요소로 처리
- 제목과 메타 정보 대비를 더 벌리기

### 공통 토큰
- 배경은 아주 옅은 tinted gray
- surface는 거의 흰색
- border는 있어도 존재감이 낮아야 함
- 본문 텍스트는 순검정보다 한 톤 부드럽게
- 포인트 블루는 면적보다 기능 강조에만 사용

## 7. 작업 우선순위

1. `HomeScreen`에서 카드 느낌을 줄이고 activity block 느낌으로 재정비
2. `RootNavigator`의 탭 inactive 존재감 축소
3. `DocumentsScreen`을 카드 중심에서 리스트 중심으로 정리
4. 마지막에 색상 토큰과 상태 배지 미세 조정
