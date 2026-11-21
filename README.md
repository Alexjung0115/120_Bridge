# 120 Bridge (120 브릿지)

> **"시민은 같은 말을 두 번 하지 않고, AI는 확인된 근거만 말하며, 상담사는 요약된 맥락을 그대로 이어받습니다."**  
> 서울시·25개 자치구 민원 상담을 위한 **근거 기반 AI 상담 & 맥락 보존 이관(Handoff) 솔루션**

---

## 📌 프로젝트 개요

**120 Bridge**는 서울 120 다산콜센터의 핵심 페인포인트(시민의 반복 설명 피로, 부서 핑퐁 민원, AI의 환각 및 무근거 답변)를 해결하기 위해 개발된 공공 생활행정 특화 지능형 민원 상담 솔루션입니다.

시민에게는 검증된 행정 문서에 근거한 정확한 생활 안내를 제공하고, 개인 정보 조회나 복합 민원 등 사람의 판단이 필요한 경우 대화 맥락과 확인된 요약을 온전히 보존하여 전문 상담사에게 신속하게 인계합니다.

---

## 🏛️ 서비스 핵심 원칙

| 핵심 원칙 | 설명 | 기술적 구현 및 보장 |
| :--- | :--- | :--- |
| **1. Grounded Guidance<br>(철저한 근거 기반 안내)** | 추측이나 환각 없이 **공식 원문 대조가 완료된 근거 문서에만 기반**하여 답변합니다. | • 서울시·자치구 공식 조례·안내문 6건 원문 검증 (AI1 승인 29개 Claim 확보)<br>• 근거 청크 단위 n-gram 랭킹 및 인용문/기준일/출처 URL 필수 표기<br>• 미검증 분야나 개인 정보 조회는 임의 확답 없이 즉시 '이관' 분기로 전환 |
| **2. Human-First Handoff<br>(사람 우선 즉시 이관)** | 시민이 원할 때는 언제든 AI 대화를 중단하고 **상담사 연결을 최우선**합니다. | • "상담사 연결", "사람 바꿔줘", 키패드 1번 등 명시적 요청 시 즉시 이관 분기 진입<br>• 필수 정보 미응답 시 최대 2회 되묻기 제한 (3회차 강제 연결 제안)<br>• 매우 불만 감정 감지 시 번거로운 확인 절차를 생략하고 즉시 긴급 이관 |
| **3. Context Preservation<br>(맥락 보존 요약 및 확인)** | 시민이 **말한 내용을 상담사에게 다시 설명할 필요가 없도록** 만듭니다. | • 다중 문의(복합 이슈) 발생 시 해결 항목과 미해결 항목을 분리 추적<br>• 시민이 직접 요약본을 확인·단일 필드 부분 정정 후 최종 전달<br>• 상담사 콘솔 대기열에 대화록 전권, 감정 추정치, 최적 창구 후보 랭킹 제공 |
| **4. Policy Replacement<br>(정책 변경 이력 추적)** | 조례나 제도가 개편되었을 때 **이전 기준과 최신 기준을 엄격히 구분**합니다. | • Q&A 개정일·시행일 기준 유효기간 기반 필터링<br>• 이전 제도는 '변경 전 이력'으로 관리하고 최신 유효 근거로만 답변 |

---

## 🎬 3대 대표 시나리오

### 1. 단순 생활 문의: 마포구 대형폐가전(냉장고/소파) 배출
- **핵심 포인트**: 목적별 지역(거주지 vs 배출 장소)을 분리 인식하며, 자치구가 확인되기 전에는 비용을 임의로 단정하지 않습니다.
- **처리 흐름**: 배출지 마포구 확인 ➔ 마포구 조례 기준 정상 제품 무상 방문 수거(1599-0903) 안내 ➔ 부품 훼손 시 스마트클린 마포 유상 배출 절차(수수료 표 기준 8,000원) 안내 ➔ AI 단독 완료.

### 2. 정책 변경 및 미해결 문의: 기후동행카드 청년 할인 및 페이백
- **핵심 포인트**: 정책 변경 일정(선불/후불 카드 전환, 페이백 신청 연장)의 유효기간을 반영하고, 개인 계좌 입금 내역은 조회할 수 없음을 인지합니다.
- **처리 흐름**: 제도 개편 안내 ➔ 개인 입금 확인 불가 안내 및 상담사 연결 제안 ➔ 시민이 요약본의 신청 시기를 부분 정정("아니요, 9월 초예요") ➔ 정정된 요약 및 1순위 처리 창구(티머니) 추천과 함께 상담사 콘솔로 이관.

### 3. 복합 문의 및 사람 즉시 연결: 수도 요금 이상 청구
- **핵심 포인트**: 개인별 계량기 요금 조회는 상담사 전담 창구(ARS 2번) 소관임을 인지하고, 추측성 답변(누수, 이중 청구 등)을 절대 하지 않습니다.
- **처리 흐름**: 수도 문의 인입 ➔ 개인 요금 조회 불가 판단 ➔ 시민의 즉시 상담사 요청 ➔ 대기열 전달 및 실시간 상담사 수락 화면 전환.

---

## 📊 독립 일반화 평가 체계 (Generalization Suite)

대본 암기나 단순 키워드 매칭을 방지하기 위해 **독립 15문항 검증 체계**를 상시 구축하여 운영합니다:

1. **새로운 근거 문항 (G01~G05)**: 훈련 세트에 없던 신규 질문에 대해 청크 단위 정밀 인용 검증 (`sourceReview: "verified"`)
   - 마포구 1인용 소파 수수료 (4,000원)
   - 스마트클린 마포 수기 배출증 부착 허용
   - 기후동행카드 3일 단기권 지속 운영 확인
   - 선불 기후동행패스 발급사 및 K-패스 2중 등록 요건
   - 120 다산콜센터 해외 전용 유선 번호 (82-2-731-2120)
2. **변형 질의 문항 (V01~V05)**: 거주지와 배출지가 다른 경우, 도중 지역 정정, 복합 발화 등 목적별 장소 보존 검증
3. **근거 없음 및 개인조회 문항 (N01~N05)**: 보건소 실시간 예약, 임대보증금 선정 여부, 도서관 대출 정지 해제 등 권한 밖 문의에 대해 AI가 답변을 지어내지 않고 반드시 이관하는지 검증

---

## 🛠️ 시스템 아키텍처 및 기술 스택

```text
[ 시민 웹/모바일 UI ]  <--- (HTTP / REST) --->  [ Next.js App Router (BFF) ]
   • 음성/텍스트 상담                             • 세션 및 상태 전이 관리 (Finite State Machine)
   • 요약 확인 및 부분 수정                        • 인하우스 한글 n-gram 랭커 & 정책 필터링
   • 실시간 연결 상태 표시                         • 상담사 대기열 관리 & 메트릭 집계 API
                                                          |
                                                          +--- [ Supabase / PostgreSQL ]
                                                          |     • 행 단위 보안(RLS) & RPC 원자 처리
                                                          |     • 감사 로그 및 스냅샷 보존
                                                          |
                                                          +--- [ AI 추론 엔진 (FastAPI / GMS) ]
                                                                • OpenAI Responses (gpt-4.1-mini)
                                                                • 다중 이슈 추출, 근거 검증 답변, 요약 초안
```

### Frontend & BFF
- **Framework**: Next.js 16.4 (App Router), React 19, TypeScript
- **Styling & UI**: Tailwind CSS 4, 정부 디자인 시스템(KRDS) 토큰, Lucide Icons, Pretendard GOV
- **State & Data**: TanStack Query 5, Zod 4 (입출력 스키마 철저 검증)

### Backend & AI Pipeline
- **AI Engine**: Python 3.13, FastAPI, OpenAI Responses API (`gpt-4.1-mini`), Pydantic
- **Retrieval (RAG)**: 인하우스 한글 n-gram 텍스트 랭킹, 청크 단위 메타데이터(출처 URL, 조례 시행일, 자치구 관할구역) 검증 필터, 정책 대체(Replacement) 추적기

### Database & Storage
- **Production**: Supabase (PostgreSQL 16), Row Level Security (RLS), Stored Procedures (RPC)
- **Local Dev/Mock**: `@electric-sql/pglite` 기반 임베디드 WASM Postgres (외부 의존성 없는 원클릭 로컬 구동)

---

## 📂 디렉터리 구조

```text
120Bridge/
├── frontend/                     # Next.js 프론트엔드 및 BFF 서버
│   ├── src/
│   │   ├── app/                  # 시민 화면(/citizen), 상담사 화면(/counselor), API 라우트
│   │   ├── components/           # UI 컴포넌트 (요약 카드, 안내 카드, 연결 배너 등)
│   │   └── lib/
│   │       ├── dialogue/         # AI2: 대화 해석, 모델 클라이언트, 요약, 창구 라우팅
│   │       ├── retrieval/        # AI1: 청크 색인, n-gram 검색, 정책 대체 관계 검증
│   │       ├── schema/           # 공통 데이터 스키마 (Session, Issue, Handoff, Candidate)
│   │       ├── server/           # 세션 런타임, 인증, 토큰 보호, 콘솔 API
│   │       └── store/            # 세션 및 대기열 지속성 스냅샷 저장소
│   └── tests/
│       ├── fixtures/             # 독립 15문항, 정책 검증, 골든 턴 테스트 데이터
│       ├── integration/          # US1 안내 평가기, 세션 복구, 권한 검증 테스트
│       └── unit/                 # 검색, 요약, 모델 클라이언트, 이슈 추적 단위 테스트
├── backend/                      # Python FastAPI 추론 마이크로서비스
│   ├── dialogue.py               # 구조화 프롬프트 및 후보 검증
│   ├── model_client.py           # Responses API 클라이언트
│   └── tests/                    # 백엔드 단위/계약 테스트
├── data/                         # 행정 근거 자료 및 검증 데이터셋
│   ├── claims.json               # 공식 원문 대조 승인된 29개 Claim
│   ├── replacements.json         # 정책 대체 및 유효기간 관계
│   ├── evidence-log.jsonl        # 원문 스냅샷 해시 및 수집 감사 로그
│   └── normalized/corpus.json    # 정규화된 지식 베이스 코퍼스
├── rag-data/                     # 서울시·자치구 행정 지식 원본 마크다운
├── specs/                        # 제품 요구 명세(SpecKit), 데이터 모델, 태스크 일정표
└── scripts/                      # 코퍼스 빌드, 근거 검증, 로컬 통합 실행 스크립트
```

---

## 🚀 빠른 시작 가이드 (Getting Started)

### 1. 사전 요구사항
- Node.js 20 이상 (Node.js 24 권장)
- Python 3.12 또는 3.13 (선택 사항: 백엔드 단독 테스트 시)

### 2. 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/Alexjung0115/120_Bridge.git
cd 120_Bridge/frontend
npm install
```

### 3. 로컬 풀스택 원클릭 실행 (WASM Embedded DB 모드)
외부 Supabase 설정 없이 로컬 PGlite DB를 사용하여 시민 화면과 상담사 콘솔을 즉시 구동할 수 있습니다.
```bash
# 저장소 루트에서 실행
node scripts/dev-mvp.mjs
```
- **시민 상담 화면**: [http://localhost:3100/citizen](http://localhost:3100/citizen)
- **상담사 업무 콘솔**: [http://localhost:3100/counselor](http://localhost:3100/counselor)
- **통합 MVP 데모**: [http://localhost:3100/mvp](http://localhost:3100/mvp)

### 4. 근거 데이터 및 테스트 검증
```bash
# 1. 29개 핵심 Claim 원문/청크 일치 검증
node scripts/check-claims.mjs

# 2. 프론트엔드 및 AI 로직 단위 테스트
cd frontend
node --experimental-strip-types --test tests/unit/interpret-answer.test.ts
node --experimental-strip-types --test tests/unit/issues.test.ts
node --experimental-strip-types --test tests/unit/model-client.test.ts
node --experimental-strip-types --test tests/unit/routing-result.test.ts

# 3. 독립 15문항 일반화 평가기 검증 (T018)
node --experimental-strip-types --test tests/integration/us1-guidance.test.ts
```

---

## 👥 팀 구성 및 역할 분담

본 프로젝트는 전문 역할을 분담하여 빈틈없는 협업 체계로 구축되었습니다:

- **Frontend (FE)**: 시민 음성/텍스트 상담 인터페이스, 실시간 자막 및 근거 카드 컴포넌트, 상담사 대기열 관리 콘솔, E2E 시나리오 시연 구현.
- **AI 1 (Data & Retrieval)**: 서울시·자치구 조례 및 안내문 원문 수집/검증, n-gram 기반 관할 필터 랭킹 엔진, 정책 대체 관계(Replacement) 색인화.
- **AI 2 (Dialogue & Evaluation)**: 다중 문의 분리 및 이슈 라이프사이클 관리, 목적별 지역 인식, 환각 방지 근거 기반 답변 생성, 이관 요약 모델, 독립 15문항 평가기.
- **AI 3 (Server, Contract & Policy)**: 세션 유한 상태 머신(FSM), 명령 멱등성 보장, 행 단위 보안(RLS) 및 상담사 원자적 이관 배정 RPC, 모의 지표 집계.
