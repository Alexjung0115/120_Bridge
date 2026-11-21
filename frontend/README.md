# 120 Bridge 프론트엔드

120 Bridge는 시민의 민원 상담을 AI가 돕고, 필요한 경우 상담사가 대화 맥락을 이어받도록 하는 서비스입니다. 시민이 상담사에게 같은 내용을 다시 설명하는 부담을 줄이고, 근거를 바탕으로 적절한 담당 창구를 찾는 것을 목표로 합니다.

## 서비스 원칙

- **언제든 사람에게 연결:** 시민이 상담사를 요청하면 다른 조건보다 우선해 연결 단계로 이동합니다.
- **한 번만 말하기:** 상담 내용을 요약하고 시민의 확인을 받은 뒤 상담사에게 전달합니다.
- **근거 있는 창구 안내:** 관련 자료와 기준일을 함께 보여 주고, 변경된 정책은 이전 자료와 구분합니다.

## 계획된 화면

### 시민 상담 화면

- 음성 또는 글자로 민원을 입력하고 답변과 자막을 확인합니다.
- 답변의 출처와 기준일을 확인합니다.
- 상담사 연결을 요청하고, 전달할 요약 내용을 확인합니다.

### 상담사 업무 화면

- 전달된 상담 요약과 대화 기록, 이관 사유 및 감정 상태를 확인합니다.
- 담당 창구 후보와 판단 근거를 확인합니다.

## 현재 개발 상태

현재는 Next.js 기본 화면과 프론트엔드 개발 환경을 구성한 초기 단계입니다. 위 상담 기능과 화면은 기획된 내용으로, 아직 구현되지 않았습니다. TanStack Query는 설치되어 있으며 서비스 연동은 진행 전입니다.

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| 프레임워크 | Next.js 16, React 19, App Router |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS 4 |
| 서버 상태 관리 | TanStack Query 5 |
| 코드 검사 | ESLint |
| 패키지 관리자 | npm |

## 시작하기

### 이메일 로그인 설정

- `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정합니다.
- Supabase 이메일 인증을 활성화하고 기본 가입 확인 및 로그인 링크 템플릿을 사용합니다. URL Configuration의 Redirect URLs에 배포 환경과 로컬의 `/auth/callback` 주소를 등록합니다.
- 인증 요청과 메일 링크는 같은 브라우저에서 열어야 합니다. Supabase 기본 SMTP는 팀원 주소로만 발송할 수 있어 일반 시민 대상 발송에는 별도 SMTP가 필요합니다.
- 상담사는 미리 생성한 계정의 서버 관리 `app_metadata.bridge_role`을 `counselor`로 설정해야 합니다. 사용자 편집이 가능한 `user_metadata`는 권한에 사용하지 않습니다.
- 현재 로그인은 화면 접근을 보호합니다. 상담 API의 인증과 데이터 접근 권한은 AI3의 API 계약에 맞춰 별도로 연결해야 합니다.

`frontend` 디렉터리에서 실행합니다.

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

```bash
npm run lint   # 코드 검사
npm run build  # 프로덕션 빌드
npm run start  # 빌드 후 프로덕션 서버 실행
```

## 디렉터리 구조

```text
frontend/
├── public/          정적 파일
├── src/app/         App Router 페이지, 레이아웃, 전역 스타일
├── package.json     의존성과 실행 명령어
└── next.config.ts   Next.js 설정
```

## 프로젝트 자료

- [기획서 보강안](../기획서-보강안.md)
- [시연 대본](../demo/demo-script.md)
- [시연 시나리오별 기준](../demo/golden-turns.json)
- [상담 근거 자료](../rag-data/)
