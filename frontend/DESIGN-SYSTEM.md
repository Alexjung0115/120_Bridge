# 프론트엔드 디자인 기준

첨부된 KRDS 스타일 가이드 이미지와 Figma 일반 모드 색상 토큰을 기준으로 한 준비 사항입니다. 고대비 모드는 적용하지 않습니다.

## 현재 사용 가능한 토큰

- 색상: `app/color-tokens.css`의 이름에서 `--color-`를 빼고 `bg-`, `text-`, `border-` 등을 붙입니다. 예: `bg-background-gray-subtler`, `text-text-basic`.
- 간격: `guide-gap-1` ~ `guide-gap-12`, `guide-p-1` ~ `guide-p-10`. 기존 Tailwind `gap-4`, `p-4`는 변경하지 않았습니다.
- 모서리: `rounded-guide-xsmall`, `rounded-guide-small`, `rounded-guide-medium-1` ~ `rounded-guide-medium-4`, `rounded-guide-large`, `rounded-guide-xlarge`.
- 아이콘 크기: `size-icon-12`, `size-icon-16`, `size-icon-20`, `size-icon-24`, `size-icon-32`, `size-icon-40`. 아이콘 파일은 포함하지 않습니다.
- 글자: `type-display-large`, `type-heading-medium`, `type-body-medium` 및 `app/design-tokens.css`의 나머지 `type-*` 클래스. 화면 폭 768px부터 PC 크기를 적용하며, 이 경계값은 공식 키트와 맞춘 구현 기준입니다.
- 기본 서체는 Pretendard GOV 400·700입니다. 시스템 폰트로 대체될 수 있습니다.

## 컴포넌트 및 확인 필요

공식 `krds-react` 패키지를 설치했지만 스타일을 전역으로 연결하지 않았습니다. 공식 CSS는 root 글자 크기를 62.5%로 설정하고 내부에서 10px 기준 rem을 사용하므로, 16px 기준 Tailwind 유틸리티와 그대로 결합하면 크기가 바뀝니다. 컴포넌트를 실제 화면에 연결하기 전 격리 방법과 Next.js App Router·React 19 동작, 키보드·스크린리더 접근성을 검증해야 합니다. 패키지 설치는 개별 컴포넌트의 동작·접근성 검증을 뜻하지 않습니다.

이미지에 정확한 그림자 수치와 아이콘 리소스가 없어 그림자 단계와 아이콘 세트는 아직 등록하지 않았습니다. 정부 공식 로고·공식 사이트 안내 문구는 예시 서비스에 무단으로 표시하지 않습니다.

공식 자료: https://www.krds.go.kr/html/site/outline/outline_03.html, https://www.krds.go.kr/storybook/react
