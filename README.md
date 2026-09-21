# Design QA Assistant (Figma Plugin — MVP)

팀 내부용 디자인 QA 체크 Figma 플러그인. 세 가지 기능을 하나의 플러그인으로 묶은 MVP입니다.

## 기능

### 1. 네이밍 체크 (레이어 이름 린터)
- 이름 앞뒤 공백 감지
- 연속되거나 끝에 남은 슬래시(`//`, 끝 `/`) 감지
- 같은 그룹 내 대소문자 혼용 감지 (예: `Button/...` vs `button/...`)
- 같은 그룹 내 단복수 혼용 감지 (예: `btn/...` vs `btns/...`)

레이어를 선택하고 검사하면 선택 범위(하위 포함)만 검사하고, 선택이 없으면 현재 페이지 전체를 검사합니다. 문제 항목을 클릭하면 해당 레이어로 캔버스가 이동합니다.

### 2. 컬러 대비 체크 (WCAG)
- solid fill이 있는 레이어 2개를 선택하면 WCAG 2.x 대비 비율을 계산
- AA/AAA, 일반 텍스트/큰 텍스트 기준 통과 여부를 배지로 표시

### 3. CSS 스니펫 추출
- 선택한 레이어의 색상(fill), 텍스트 스타일(fontSize/family/lineHeight/letterSpacing), Auto Layout 간격/패딩, 코너 radius를 CSS 클래스로 변환
- 클립보드 복사 버튼 제공

## 설치 (Figma 데스크톱 앱)

1. Figma 데스크톱 앱에서 **Plugins → Development → Import plugin from manifest...**
2. 이 저장소를 clone한 폴더의 `manifest.json` 선택
3. Plugins → Development → Design QA Assistant 실행

## 파일 구조

```
figma-qa-toolkit/
├── manifest.json   # 플러그인 매니페스트
├── code.js         # 메인 스레드 (figma API 접근, 검사 로직)
├── ui.html         # 플러그인 UI (iframe, 탭 3개)
├── package.json
└── README.md
```

빌드 단계 없이 `code.js`를 Figma가 바로 로드하는 구조라 MVP 단계에서는 개발 사이클이 빠릅니다. (추후 TypeScript로 옮길 경우 `code.ts`를 추가하고 컴파일 산출물을 `code.js`로 지정하면 됩니다.)

## 알려진 제한 (MVP 단계)

- 네이밍 린터는 첫 세그먼트(`/` 기준) 단위로만 그룹핑합니다. 더 깊은 계층 규칙은 아직 없습니다.
- 컬러 대비 체크는 정확히 2개, solid fill이 있는 레이어만 지원합니다. (gradient, 이미지 fill 미지원)
- CSS 추출은 fill 1개 기준입니다. (다중 fill, blend mode 등은 반영되지 않음)
- 팀 컨벤션이 아직 하나로 통일되어 있지 않아(피그마 파일 내 `Button/Text`, `button/large`, `btns/left` 등 혼용 확인됨), 이번 버전은 "정답 규칙 강제"가 아니라 "일관성 깨진 곳 찾기" 방식으로 동작합니다.

## 다음 단계 (시간 될 때)

- AI로 네이밍 위반 이유를 자연어로 설명
- 대비 실패 시 AI가 대안 색상 제안
- 스페이싱(8px 그리드) 규칙 체크 추가
