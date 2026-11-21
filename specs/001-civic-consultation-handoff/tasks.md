# Tasks: 120 브릿지 — 자유 문의 상담과 맥락 이관

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/service.md](contracts/service.md), [research.md](research.md), [data-collection.md](data-collection.md), [quickstart.md](quickstart.md), [feedback-response.md](feedback-response.md).
**범위**: 최초 6시간 예산에서 사용자 최신 알림 기준 남은 4시간 50분(290분)·프런트 1명·AI 3명. 이후 경과시간은 이 갱신 시점 기준으로 읽는다. 체크박스는 태스크 전체의 완료 여부다. 먼저 진행된 프런트 개발환경·스타일 기반은 아래 코드 확인표에 완료 부분으로 반영하며, 태스크 일부가 끝나도 남은 조건이 있으면 전체 체크는 하지 않는다.
**Tests**: spec.md의 SC 수용 기준과 plan.md가 테스트를 요구하므로 시험 작업을 포함한다. 계약/정책 테스트를 구현 전에 작성하고 실패를 확인하되 테스트 파일 작성과 통과를 구별한다.
**Organization**: Setup → Foundational → P1 US1·US2·US4·US5 → P2 US3 → 통합 검증. US 번호는 spec.md를 유지한다.

**추가 명확화 반영**: FR-038/SC-024에 따라 T024·T028은 queued 동안 대기를 표시하고 T033의 claim 성공 시 ‘상담사 연결 완료’ 최종 화면으로 전환한다. 이후 상담 입력·상태 polling·TTS는 종료하고 complete_case/transfer_demo 결과는 시민에게 표시하지 않는다. T032·T033의 콘솔 처리·개선·지표는 계속 유지하며 T045·T048에서 수신/수락 구분·최종 화면 유지·시연 표기를 검증한다. 향후 문자 상담은 기존 sessionId/handoffId를 참조하는 별도 메시지 모듈로 확장하되 이번 task에 메시지 송수신·채팅 화면을 추가하지 않는다. 기존 51개 ID는 유지하고 시간은 사용자 요청에 따라 아래 단축 목표로 재산정한다.

## 프런트 선행 진행 현황 — 코드 확인 기준

프런트 담당자가 먼저 진행한 작업을 현재 진행분으로 기록한다. 별도의 재사용·리팩터링·재구축 작업을 새로 요구하지 않는다. 구현 코드는 이 점검에서 변경하지 않았다.

| 먼저 진행된 항목 | 확인 근거 | 관련 태스크 / 남은 부분 |
| --- | --- | --- |
| Next.js 프로젝트 초기화·기본 페이지/레이아웃·lockfile | frontend/package.json, frontend/package-lock.json, frontend/src/app/page.tsx, frontend/src/app/layout.tsx | T001 부분 완료. 프로젝트 생성은 완료, 실행/검증 명령·환경변수·서비스 설정은 남음 |
| Next.js 16.4.6·React 19.3.0·TypeScript·Tailwind·ESLint 설정 | frontend/package.json, frontend/tsconfig.json, frontend/eslint.config.mjs | T001 부분 완료. 현재 버전을 설치 전 상태로 오해하거나 다시 초기화하지 않음 |
| 디자인/색상 토큰·전역 스타일·focus-visible·아이콘 파일 | frontend/src/app/design-tokens.css, frontend/src/app/color-tokens.css, frontend/src/app/globals.css, frontend/assets/icon/ | T004 부분 완료. 토큰/아이콘 준비는 완료, 두 서비스 화면·카드·모의 표기·연결 위치는 남음 |
| TanStack Query 의존성 등록 | frontend/package.json | 라이브 API 연동 완료가 아님. Provider·조회/변경·polling은 T017·T028·T032·T045 진행 시 확인 |
| AI 요청 프록시 설정 | frontend/next.config.ts의 /api/ai/:path* → Cloud Run rewrite | 설정 작성은 완료. T010·T047·T048에서 실제 경로·요청/응답·인증·상태 소유와 배포를 검증 |
| 시민/상담사 서비스 화면·음성·서버 상태·시험 | 시민 page.tsx는 Next 기본 예제이며 console 페이지·components·api·tests 폴더는 현재 없음 | T017·T024·T026–T029·T032·T041·T045 등은 미완료 |

확인 한계: 로컬 frontend/node_modules가 없어서 lint/build/브라우저 실행은 이번 문서 갱신에서 검증하지 않았다. 원격 Cloud Run 서비스의 소스와 실행 결과도 확인하지 않았다. frontend/DESIGN-SYSTEM.md에는 krds-react 설치 설명이 있지만 현재 package.json/lockfile에는 해당 의존성이 없어 설치 완료로 집계하지 않는다. 코드 확인과 실제 동작 검증을 구분한다.

경로 반영: 이 저장소의 Next 앱 위치는 frontend/다. 아래 앱·시험·스크립트 경로는 실제 프로젝트 위치를 따라 frontend/src/, frontend/tests/, frontend/scripts/로 표기한다. 문서·근거 자료·검증 결과(data/)는 저장소 루트 기준이다. 이는 폴더 위치 정정이며 서버 배포 구성을 새로 결정했다는 뜻이 아니다.

## Format: `[ID] [P?] [Story] Description`

목적별 지역 확인 명확화: T015·T020은 data-model.md의 Issue.locations, Issue.locations.purpose, Issue.locations.district, Issue.locations.originTurnId, Issue.locations.confirmed 및 Issue.jurisdiction을 근거로 배출지/발생지/거주지를 구분한다. T014는 선택된 문의 관할로 검색하고 정정 시 근거를 갱신한다. T018·T044·T046은 SC-025 다섯 경로와 기존 냉장고 fixture의 목적별 지역 매핑을 검증한다. 작업 ID·담당·51개 총수는 유지한다.

- FE=프런트 1명, AI1=수집·검색, AI2=대화·요약, AI3=서버·정책·통합.
- 각 작업의 담당·예상 순수 작업시간·선행 ID를 명시한다. 시간은 기존 36건 재사용·AI 보조 구현·공통 코드 재사용을 전제로 줄인 낙관적 목표치이며, 작업량 축소나 실측 생산성 향상을 의미하지 않는다. 시간은 보장이 아닌 병렬 실행의 초기 예산이며 실패 조사·모델 지연·배포 대기는 별도 여유로 관리한다.
- [P]는 명시한 선행 작업이 끝난 후 다른 파일을 담당하는 작업과 병행 가능하다는 뜻이다. 같은 담당자의 동시 실행이나 아직 끝나지 않은 선행 작업의 생략을 뜻하지 않는다.
- 아래 파일 경로는 저장소 루트 기준이다. 데이터 제약은 data-model.md의 정확한 Entity.field 참조를 따른다. 공통 파일 소유자는 AI3이며 다른 담당자는 공개 모듈 경계를 통해 사용한다.
- 호스팅·외부 계정·실키·실제 모델은 확보된 것으로 가정하지 않는다. 배포 작업이 적혀 있어도 계정 구매나 실제 배포를 이번 문서 작성에서 실행하지 않는다.

## Phase 1: Setup — 실행 환경과 역할 고정

**Goal**: 앱 골격·실모델·제출 환경 가능성·자료 목록을 확인한다. `.specify/memory/constitution.md` v1.0.0과 사용자 확정 명세를 기준으로 삼는다.

- [ ] T001 AI3·10분·선행 없음: 【부분 완료】frontend/package.json·frontend/package-lock.json·frontend/tsconfig.json과 기본 frontend/src/app/page.tsx·frontend/src/app/layout.tsx의 초기 생성은 프런트 선행 작업으로 완료되었다. 남은 범위는 frontend/package.json의 계획된 테스트/자료 검증 명령·필요 의존성 확인과 frontend/.env.example·.gitignore의 비밀값 제외, 저장소 루트 .gitignore의 data/snapshots 제외다. 현재 앱 버전을 기준으로 진행하고 프로젝트 초기화·기본 파일 생성을 다시 작업으로 잡지 않는다. frontend/.env.example에 CONSOLE_AGENT_ID=demo-agent-1 등 서버 설정 이름만 기록한다. 한국어 메타데이터와 lang 설정은 T004에서 담당한다.
- [x] T002 [P] AI2·10분·선행 T001: Cloud Run 백엔드의 `backend/preflight_model.py`에서 GMS `gpt-4.1-mini` 한국어 입력·구조화 출력·지연·형식 오류를 확인했다. [실제 호출 기록](../../docs/runtime-preflight.md)은 모델 ID·측정값·검증 결과를 담는다. 배포 환경의 AI·RAG 검증은 통합 단계에서 수행한다.
- [ ] T003 [P] AI1·10분·선행 T001: rag-data/index.json의 36건·고유 URL·검증 상태·관할·날짜 충돌을 감사해 data/source-manifest.json과 data/audit-report.json에 핵심 6건·미검증·차단·우선순위를 기록한다. data-collection.md의 수집 시간/허용 출처를 적용한다.
- [ ] T004 [P] FE·15분·선행 T001: 【부분 완료】frontend/src/app/globals.css·color-tokens.css·design-tokens.css의 스타일 기반과 frontend/assets/icon/ 아이콘 준비는 프런트 선행 작업으로 완료되었다. 남은 범위는 frontend/src/components/layout/DemoShell.tsx의 두 서비스 화면 공통 골격·모의 상담 표기·중립 확인 카드·상시 연결 위치와 frontend/src/app/layout.tsx의 한국어 lang/서비스 메타데이터다. 기본 페이지는 서비스 화면 완료로 세지 않는다. 실제 제공되는 서체와 layout/globals의 폰트 적용을 확인하고 docs/deployment-preflight.md에 제출 HTTPS/마이크/상태 공유 검증 전제를 기록한다.

**Checkpoint**: 명령 실행 골격, 실제 모델 가능 여부, 제출 환경 전제, 데이터 감사가 확인되어야 한다. 미확보 전제는 해결하지 않고 완료로 체크하지 않는다.

## Phase 2: Foundational — 모든 여정의 공통 기반

**Goal**: 공통 타입·저장·접근·모델 어댑터·문서 스키마·요청 처리를 고정한다. 공통 타입이 고정되면 자료 수집·모델·화면 fixture 작업을 병행한다. 실제 API 통합은 해당 작업에 필요한 저장·인증·라우트 선행 작업을 완료한 후 진행한다.

- [ ] T005 AI3·15분·선행 T001: frontend/src/lib/contracts.ts와 frontend/src/lib/schema/session.ts에 Session·Turn·명령 봉투·API 오류 스키마를 정의하고 frontend/tests/unit/schema-session.test.ts에서 경계값을 검증한다. 정식 제약 출처는 data-model.md의 Session.id, Session.revision, Session.state, Session.activeIssueId, Session.handoffId, Session.pendingRequestId, Session.outcome, Session.outcomeConfirmedAt 및 Turn.id, Turn.sessionId, Turn.role, Turn.inputMode, Turn.outputStatus, Turn.timestamp다. 계약의 commandId/baseRevision·문자/턴/세션 제한도 연결한다. 제약 참조 보완: data-model.md의 Session.createdAt, Session.updatedAt, Session.businessDate.
- [ ] T006 AI3·15분·선행 T005: frontend/src/lib/store/session-store.ts와 frontend/src/lib/store/snapshot.ts에 세션별 직렬 명령·revision·멱등 결과·원자적 지속 스냅샷·재시작 복구를 구현하고 frontend/tests/integration/store-recovery.test.ts로 확인한다. data-model.md의 Session.citizenTokenHash, Session.revision, Session.pendingRequestId 및 Turn.outputStatus를 준수하며 모델 대기 동안 명령 잠금을 유지하지 않는다.
- [ ] T007 AI3·10분·선행 T006: frontend/src/lib/server/auth.ts와 frontend/src/lib/server/limits.ts에 시민 세션 토큰/콘솔 토큰 분리·동일 세션 접근 검사·로그 비식별·요청/세션 제한·no-store를 구현한다. frontend/tests/integration/auth-limits.test.ts에서 다른 세션·콘솔 접근을 차단하고 키/원문/평문 토큰 비노출을 확인한다. 콘솔 토큰은 서버 환경 CONSOLE_AGENT_ID의 단일 가상 상담사로 매핑하고 클라이언트의 agentId는 신뢰하지 않는다.
- [x] T008 [P] AI2·15분·선행 T002,T005: frontend/src/lib/dialogue/model-client.ts와 frontend/src/lib/dialogue/candidate-schema.ts에 Responses 어댑터·구조화 출력 재검증·timeout·복구 1회·취소/늦은 결과 폐기를 구현한다. frontend/tests/unit/model-client.test.ts에서 오류·지연·문서 속 명령 무시를 확인하고 모델이 state를 직접 쓰지 못하게 한다.
- [ ] T009 [P] AI1·10분·선행 T003,T005: frontend/src/lib/retrieval/document-schema.ts에 정규화 스키마를 구현하고 frontend/tests/unit/document-schema.test.ts로 확인한다. data-model.md의 Document.docId, Document.publishedAt, Document.updatedAt, Document.effectiveFrom, Document.effectiveUntil, Document.sourceVerifiedAt, Document.verificationStatus, Citation.basisDate, Citation.quote, Replacement.validFrom, Replacement.validUntil를 각각 인용하며 Chunk.answerEligible·Chunk.routingEligible·Chunk.conflicts는 별도 검증한다. docId는 기존 상대 경로, 시간 해석·기간 경계는 canonical 정의를 따른다. 제약 참조 보완: data-model.md의 Document.retrievedAt, Chunk.chunkId, Chunk.docId.
- [ ] T010 AI3·20분·선행 T004,T005,T006,T007: frontend/src/app/api/sessions/route.ts와 frontend/src/app/api/sessions/[id]/route.ts 및 frontend/src/lib/server/http.ts에 생성/조회·clientSessionKey 재시도·봉투·오류 코드를 구현한다. frontend/tests/contract/sessions.test.ts에서 현재 상태·접근·중복 생성을 검증하고 시민/콘솔 fixture 경계를 frontend/src/lib/fixtures.ts로 제공한다. 확보된 보유 환경에 앱 골격의 HTTPS 배포를 먼저 시험하고 docs/deployment-runbook.md에 단일 인스턴스·지속 디스크를 기록한다. 이후 live API가 합쳐질 때 같은 환경을 갱신하고 T047은 최종 빌드 승격·재검증으로 수행한다. 코드에 이미 있는 frontend/next.config.ts의 AI rewrite 작성은 선행 완료 부분으로 인정한다. 서비스 세션 API와 /api/ai 프록시를 혼동하지 않고 실제 Cloud Run 요청 계약·상태 저장 주체·제출 환경을 확인해 docs/deployment-runbook.md에 기록한다. Vercel/서버리스가 세션 상태를 소유한다면 메모리/로컬 파일을 공유 저장으로 간주하지 않고 기존 계획과의 차이를 먼저 해결한다. 이 확인 전 원격 API·배포 완료로 체크하지 않는다.

**Checkpoint**: T005–T010은 live 통합 기반이다. 모든 담당자가 전체 기반 완료를 기다리지는 않으며, 각 task에 적힌 최소 선행 조건을 충족한 자료/모델/fixture 구현을 병행한다. 스키마 변경은 AI3가 병합하며 각 담당자는 자신의 모듈 파일만 편집한다.

## Phase 3: User Story 1 — 근거 있는 생활 안내 받기 (P1, 첫 동작 증분)

**Goal**: 자유 문의를 접수하고 필요한 정보만 확인해 유효 근거로 안내한다.
**Independent Test**: 자치구 미확인 → 마포구 냉장고·다른 품목 안내 → 훼손/용량 확인 → 종료. 근거 없는 질문도 접수하며 사실을 만들지 않는다. 이관 확정 동작은 US2에서 완성한다.

### Tests

- [ ] T011 [P] [US1] AI1·10분·선행 T003,T009: frontend/tests/unit/retrieval.test.ts에 자치구/시 공통·미검증·미래 시행·상충 연락처·기준일 미확인·실제 인용 불일치의 음성/양성 검색 시험을 먼저 작성한다. 개발 보정 표본과 독립 평가 fixture를 분리한다.

### Implementation

- [ ] T012 [P] [US1] AI1·40분·선행 T011: data/source-manifest.json의 핵심 6건 공식 원문을 대조하고 rag-data/ 해당 정리본, data/evidence-log.jsonl, data/sources/에 발췌·hash·확인 범위·미확인을 보존한다. data-collection.md의 5분 차단 기록·금액/표/기한/연락처 규칙을 적용하고 기존 확인 기록을 이번 검증으로 위장하지 않는다.
- [ ] T013 [US1] AI1·15분·선행 T009,T012: frontend/scripts/validate-data.ts와 frontend/scripts/build-corpus.ts에서 front matter/index 교차 검사·기관/관할 정규화·표 청크·검증 claim별 자격·중복 URL 통합·버전/hash 색인을 data/normalized/corpus.json과 data/validation-report.json으로 생성한다. 시행일과 게시/수정일을 혼용하지 않는다.
- [ ] T014 [US1] AI1·20분·선행 T011,T013: frontend/src/lib/retrieval/search.ts와 frontend/src/lib/retrieval/validate-evidence.ts에 관할/유효성/검증 필터·한글 n-gram 랭킹·상위 청크·숫자/대상/인용 검증을 구현한다. data/retrieval-calibration.json에 개발 표본 결과와 고정 임계값을 기록하고 대본 ID 라우팅을 금지한다.
- [x] T015 [P] [US1] AI2·20분·선행 T005,T008: frontend/src/lib/dialogue/interpret.ts와 frontend/src/lib/dialogue/answer.ts에 자유 표현·문맥·known/missing 정보 추출, 근거 단위별 짧은 응답·출처 후보·근거 없음 응답을 구현한다. frontend/tests/unit/interpret-answer.test.ts에서 품목/표현/순서 변경과 개인 조회 불가를 검증한다. 검색은 T014의 인터페이스 fixture로 독립 시험 후 통합한다.
- [ ] T016 [US1] AI3·20분·선행 T010,T014,T015,T020: frontend/src/app/api/sessions/[id]/turns/route.ts와 frontend/src/app/api/sessions/[id]/outcome/route.ts 및 frontend/src/lib/dialogue/orchestrator.ts에서 추출→검색→답변→검증→저장과 200/202·polling을 연결한다. 모든 항목의 시민 완료 확인만 ai_confirmed로 기록하며 단순 종료는 unknown으로 남긴다.
- [ ] T017 [P] [US1] FE·20분·선행 T004,T005: frontend/src/components/citizen/TextConsultation.tsx와 frontend/src/components/citizen/EvidenceCard.tsx에 텍스트 문의·자막·출처/기준일·한 질문·안내 완료/추가 도움을 구현한다. 계약 fixture로 독립 시험한다. frontend/src/app/page.tsx의 live API 전환과 전구간 확인은 T028·T045에서 수행한다. 명시 연결 후 AI 안내 재권유는 하지 않는다. TanStack Query는 의존성만 등록된 상태다. frontend/src/app/providers.tsx의 QueryClientProvider와 frontend/src/lib/api-client.ts의 서버 계약 연결 여부를 함께 확인하고 프록시 설정만으로 API 연동 완료를 표시하지 않는다.
- [x] T018 [US1] AI2·15분·선행 T014,T015,T016,T017: frontend/tests/fixtures/generalization.json과 frontend/tests/integration/us1-guidance.test.ts에 독립 15문항·미확보 분야/자치구 표본의 기대 근거·금지 답변·상태를 고정하고 첫 안내 증분을 검증했다. AI1 검증 자료(PR #14)를 대조해 G01–G05 기대 문서와 sourceReview=verified를 확정하고, 평가기 자체 검사 2건을 통과했다. 라이브 통합 검증은 T014/T016/T017 완료 후 수행한다.

**Checkpoint**: 새 문의에도 같은 규칙이 적용되고 미확인 지역 비용·무근거 사실 안내가 없어야 한다. US1만으로 전체 제출 MVP 완료로 간주하지 않는다.

## Phase 4: User Story 2 — 재설명 없는 이관 (P1)

**Goal**: 복합 문의를 하나씩 처리하고 명시 요청·정보 부족·개인 처리에 따라 요약/생략 이관한다.
**Independent Test**: 가상 대화 fixture로 사람 요청, 부분 안내·미해결 이관, 같은 필수 정보 두 번, 매우 불만 생략과 일반 불만 확인을 검증한다. 콘솔은 US5의 API/화면으로 연결한다.

### Tests

- [ ] T019 [P] [US2] AI3·10분·선행 T005,T007: frontend/tests/unit/handoff-policy.test.ts에 연결 우선순위·부정 표현·필수 정보 한도/낮은 신뢰 분리·무응답·매우 불만+연결 의사·전송 중 요청 경합 시험을 먼저 작성한다. 기존 수도 fixture의 일반 불만은 기본 확인으로 유지한다. 매우 불만+제안 수락은 FR-033대로 요약 확인 없이 unconfirmed 전달이며 감정만으로는 자동 이관하지 않는 시험을 명시한다.

### Implementation

- [x] T020 [P] [US2] AI2·15분·선행 T005: frontend/src/lib/dialogue/issues.ts와 frontend/src/lib/schema/issue.ts에 순차 항목·알려진 정보 재사용·미해결 보존을 구현한다. canonical 출처는 data-model.md의 Issue.id, Issue.sessionId, Issue.intent, Issue.status, Issue.fields.value, Issue.fields.status, Issue.questionCounts, Issue.noEvidenceQuestionCount, Issue.lowConfidenceStreak 및 Session.activeIssueId다. frontend/tests/unit/issues.test.ts에 두 복합 문의와 현재 active 항목 유일성을 검증한다. 제약 참조 보완: data-model.md의 Issue.fields.originTurnId, Issue.fields.confirmed, Issue.locations, Issue.locations.purpose, Issue.locations.district, Issue.locations.originTurnId, Issue.locations.confirmed, Issue.jurisdiction.
- [ ] T021 [US2] AI3·15분·선행 T019,T020: frontend/src/lib/policy/reducer.ts와 frontend/src/lib/policy/handoff.ts에 서버 최종 판정·질문 한도·명시 요청 선점·늦은 응답 폐기·거절 시 반복 질문 금지를 구현한다. FR-033 생략은 연결 의사와 함께 판정하고 원문/확인 상태를 보존한다. 규칙 표와 무관하게 FR-033의 생략 조건을 동일 reducer 분기로 적용하고 frontend/tests/unit/handoff-policy.test.ts에서 이를 고정한다.
- [x] T022 [P] [US2] AI2·15분·선행 T008,T020: frontend/src/lib/schema/summary.ts와 frontend/src/lib/dialogue/summary.ts에 요약·중요 정보 확인·부분 수정·모델 실패 시 원문 초안을 구현한다. 제약 출처는 data-model.md의 Summary.id, Summary.revision, Summary.coreLines, Summary.sentiment, Summary.sentimentIsEstimate, Summary.confirmation, Summary.confirmedAt, Summary.skipReason, Summary.fieldConfirmations이며 계약의 필드별 수정 규약을 연결한다. 제약 참조 보완: data-model.md의 Summary.sessionRevision.
- [ ] T023 [US2] AI3·20분·선행 T016,T021,T022,T031: frontend/src/app/api/sessions/[id]/handoff-request/route.ts, frontend/src/app/api/sessions/[id]/handoff-decision/route.ts, frontend/src/app/api/sessions/[id]/summary/route.ts, frontend/src/app/api/sessions/[id]/handoff-retry/route.ts를 구현한다. 최신 summaryRevision·confirm/edit/skip·미확인 생략·동일 handoff 재시도를 검증하고 T016 orchestrator에 정책을 연결한다. T031 전달 서비스 연결까지 끝나야 완료로 체크한다. 또한 frontend/src/app/api/sessions/[id]/corrections/route.ts에서 수락 전 정정→변경 항목 재확인→동일 handoff 재전달을 구현한다.
- [ ] T024 [P] [US2] FE·15분·선행 T004,T005: frontend/src/components/citizen/SummaryConfirmation.tsx와 frontend/src/components/citizen/ConnectionStatus.tsx에 항목별 확인/미확인·한 필드 수정·승인/생략·접수/전송/대기/지연/실패 표시를 구현한다. 30초는 자동 승인이 아닌 선택지 표시이며 수신 전 완료 안내를 막는다. 컴포넌트는 fixture로 완료하고 T045에서 T023 live 경로를 연결·검증한다. 대기 중에는 새 AI 상담 대신 정정 입력·변경 확인·재전달 상태와 실패 재시도를 제공한다.
- [ ] T025 [US2] AI2·10분·선행 T021,T022,T023,T024: frontend/tests/integration/us2-handoff.test.ts와 frontend/tests/fixtures/policy-cases.json으로 SC-016·018·019의 복합 문의·네 질문 한도 경로·다섯 확인/생략 경로를 통과시킨다. 처리된 항목은 맥락으로, 미해결은 이관 대상으로 구분되는지 확인한다.

## Phase 5: User Story 4 — 음성·텍스트 대체 (P1)

**Goal**: 같은 상담에 한국어 음성·자막·글자 입력을 제공하고 사람 연결을 상시 유지한다.
**Independent Test**: mock 계약으로 상태/재생을 검증한 뒤 실제 기기에서 마이크 허용·거부·무음과 텍스트 전환을 확인한다.

### Tests

- [ ] T026 [P] [US4] FE·10분·선행 T001,T004: frontend/tests/unit/speech-controller.test.ts에 기능 미지원·권한 거부·동일 utterance 재조회 중복 재생·연결 시 재생 취소·입력창의 숫자 1 예외를 작성한다.

### Implementation

- [ ] T027 [US4] FE·20분·선행 T026: frontend/src/components/speech/useSpeechController.ts와 frontend/src/components/speech/MicrophoneControl.tsx에 ko-KR STT/TTS·두 문장 낭독 단위·자막·오류/무음·텍스트 전환을 구현한다. 지원 여부를 탐지하고 음성 실패를 상담 완료로 처리하지 않는다.
- [ ] T028 [US4] FE·10분·선행 T017,T024,T027: frontend/src/app/page.tsx에 음성/텍스트 상담·항상 보이는 연결 버튼·1번 키·듣는 중/답변 중/확인 중을 통합한다. 모델 응답 중에도 연결 이벤트를 전송하고 늦은 응답을 재생하지 않는다.
- [ ] T029 [US4] FE·10분·선행 T028: docs/voice-validation.md에 실제 Chrome/시연 기기의 인식→자막→음성 1회 이상, 권한 거부·무음·텍스트 대체 결과를 기록한다. 제출 HTTPS 재검증은 T048에서 수행하며 mock 시험 성공과 구분한다.

## Phase 6: User Story 5 — 상담사 인계·수정·개선 (P1)

**Goal**: 확인된 맥락을 상담사가 대기열에서 이어받고 처리 결과·지표·개선 후보를 남긴다.
**Independent Test**: 이관 payload fixture 두 개로 기록 분리·원문·확인/미확인·수정·처리 완료·지표를 독립 검증한다. 창구 추천은 fixture로 먼저 표시하고 US3에서 실제 판정을 연결한다.

### Tests

- [ ] T030 [P] [US5] AI3·10분·선행 T005,T007: frontend/tests/contract/console.test.ts에 보호된 대기열/상세/claim/complete_case·세션별 단일 인계·오래된 요약 승인·재시도·중복 claim 계약 시험을 먼저 작성한다.

### Implementation

- [ ] T031 [US5] AI3·15분·선행 T006,T030: frontend/src/lib/schema/handoff.ts, frontend/src/lib/store/handoff-store.ts, frontend/src/app/api/console/queue/route.ts, frontend/src/app/api/console/sessions/[id]/route.ts에 인계·큐·상세와 T023용 전달 서비스를 구현한다. canonical 출처는 data-model.md의 Handoff.id, Handoff.sessionId, Handoff.status, Handoff.receivedAt, Handoff.selectedCandidateId, Handoff.agentId, Handoff.claimedAt, Handoff.completedAt, Handoff.resolutionNote, Handoff.repeatExplanationCount다. 최신 요약의 승인/생략 근거와 고유성·원자 저장을 검증한다. 전달 후 정정 버전은 data-model.md의 Handoff.deliveryRevision, Handoff.acknowledgedRevision, Handoff.pendingCorrection, Handoff.summaryHistory를 직접 참조해 구현하고 이전 이력을 보존한다. 제약 참조 보완: data-model.md의 Handoff.summaryId, Handoff.summaryRevision. 최초 sending의 acknowledgedRevision=0, 첫 수신 후 1 및 현재 전달 버전 이하라는 조건과 정정 재전달/claim 경합을 검증한다. data-model.md의 Handoff.deliveryRevision, Handoff.acknowledgedRevision, Handoff.pendingCorrection을 정확히 따른다.
- [ ] T032 [P] [US5] FE·20분·선행 T004,T005: frontend/src/app/console/page.tsx와 frontend/src/components/console/CasePanel.tsx에 토큰 입력·대기열/완료 필터·요약·확인/미확인·기존 안내·원문 접기·창구 카드·처리 결과 입력을 작성한다. fixture 두 건으로 컴포넌트를 검증하고 T045에서 T031,T033 live 경로와 연결한다. 별도 통계/관리 화면은 추가하지 않는다. 현재 console 페이지는 없으므로 상담사 화면 구현은 남은 작업이다. 전체 대화·완료 필터가 실제 동작하기 전 화면 완료로 체크하지 않는다.
- [ ] T033 [US5] AI3·15분·선행 T031: frontend/src/app/api/console/sessions/[id]/actions/route.ts와 frontend/src/lib/store/metric-events.ts에 claim/transfer_demo/complete_case·가명 담당·처리 시각·재설명 기록·중복 방지를 구현한다. 제약 출처는 data-model.md의 Session.state, Session.outcome, MetricEvent.id, MetricEvent.sessionId, MetricEvent.eventType, MetricEvent.actorPseudonym, MetricEvent.reason, MetricEvent.measurementMode 및 Handoff.completedAt다. 상담 완료를 외부 행정 처리 완료로 표시하지 않는다. 제약 참조 보완: data-model.md의 MetricEvent.timestamp. complete_case는 Session.state와 Handoff.status를 함께 completed_demo로 기록하고 실패는 Session.delivery_failed/Handoff.failed로 매핑한다. 단일 가상 담당자 ID와 session_ended terminal 이벤트의 중복 금지도 구현한다.
- [ ] T034 [US5] AI3·15분·선행 T033,T016: frontend/src/lib/metrics/aggregate.ts와 frontend/src/app/api/console/metrics/route.ts에서 AI 확인 완료율·이관율/사유·처리 건수/시간·대기·재설명과 누락 수를 산출한다. data-model.md의 Session.outcomeConfirmedAt, MetricEvent.timestamp와 계약의 분모 0/null·미완료/미확인 분리·모의 표기를 적용하고 원문을 집계 응답에 넣지 않는다. 관찰 구간의 session_ended terminal 이벤트에 속한 세션 집합에서만 분모와 ai_confirmed/handoff 분자를 계산한다. queued/serving/transferred_demo는 별도 진행 중 수로 보고하고 종료 세션당 1회만 집계한다.
- [ ] T035 [P] [US5] AI1·10분·선행 T005,T007: frontend/src/lib/improvements/candidates.ts와 frontend/src/lib/schema/improvement.ts에 비식별 개선 후보 생성·조회·보호된 내보내기를 구현한다. canonical 출처는 data-model.md의 ImprovementCandidate.id, ImprovementCandidate.sessionId, ImprovementCandidate.status, ImprovementCandidate.reviewer, ImprovementCandidate.approvedAt, ImprovementCandidate.publishedCorpusVersion, ImprovementCandidate.regressionResult다. T033 완료 결과에서 호출하고 frontend/src/app/api/console/improvements/route.ts는 콘솔 인증을 재사용한다.
- [ ] T036 [US5] AI1·15분·선행 T013,T035,T033: frontend/scripts/review-improvement.ts와 frontend/tests/fixtures/improvement-case.json에서 근거 부족 모의 상담 1건의 비식별 후보→공식 원문 검증→AI2 검토→승인→별도 corpus 버전 생성→회귀/새 질문 통과를 실행한다. data/evidence-log.jsonl와 data/improvement-validation.json에 검토자·자료 버전·결과를 남기고 승인 전 검색 반영을 막는다.
- [ ] T037 [US5] AI2·10분·선행 T031,T032,T033,T034,T035: frontend/tests/integration/us5-console-metrics.test.ts에 두 상담 기록 분리·부분 수정·전송 실패/중복·미확인·확인 완료·분모 0·미종료·처리량/시간 재계산을 검증하고 data/metrics-validation.json에 모의 결과를 기록한다. SC-026의 정정 재전달·실패/재시도·중복·claim 경합을 검증하고 정정 반영 중 오래된 요약 수락과 정정 유실을 막는다. 종료 1건·대기 2건 표본에서 이관율에 대기 상담이 섞이지 않는지, 서버 고정 담당자 식별·두 객체 완료/실패 매핑·후보 0개 사유·최초 수신 전 revision도 검증한다.

## Phase 7: User Story 3 — 최신 정책과 처리 창구 (P2, 제출 필수)

**Goal**: 구자료의 변경 항목과 현재 적용 내용을 비교하고 실제 처리 목적에 맞는 창구 후보를 제시한다.
**Independent Test**: 대화 없이 문의/근거 fixture를 넣어 최신 일정·두 변경 이력·티머니 우선·수도 부서 미생성을 검증한다. 이후 콘솔 통합을 확인한다.

### Tests

- [ ] T038 [P] [US3] AI1·10분·선행 T003,T009: frontend/tests/unit/replacement-routing.test.ts에 항목별 일정 대체·미변경 업무분장 유지·선불/후불 구분·미래 시행·근거 없는 부서명 금지 시험을 작성한다.

### Implementation

- [ ] T039 [US3] AI1·10분·선행 T012,T013,T038: data/replacements.json과 frontend/src/lib/retrieval/replacements.ts에 정책 두 문서 쌍의 claimKey별 변경 전후·유효 기간·대체 근거를 정규화하고 T014 필터와 색인에 연결한다. canonical 출처는 data-model.md의 Replacement.id, Replacement.predecessorDocId, Replacement.successorDocId, Replacement.claimKey, Replacement.validFrom, Replacement.validUntil, Replacement.evidenceChunkIds다.
- [x] T040 [P] [US3] AI2·15분·선행 T005,T008: frontend/src/lib/schema/candidate.ts와 frontend/src/lib/dialogue/routing.ts에 미해결 목적별 후보 근거·순위·신뢰를 구현한다. canonical 출처는 data-model.md의 Candidate.id, Candidate.rank, Candidate.confidence, Candidate.issueIds, Candidate.evidence, Candidate.selectedByAgent 및 RoutingResult.candidates, RoutingResult.unknownReason이다. 최대 후보 개수와 근거 부재 규칙은 data-model.md Candidate 절을 따르고 T039 완료 전에는 검증 청크 fixture로 독립 시험한다. 빈 후보의 사유는 RoutingResult에만 저장하고 Candidate 배열 원소에 넣지 않는다. frontend/tests/unit/routing-result.test.ts에서 후보 유무와 nullable 사유의 관계를 검증한다.
- [ ] T041 [US3] FE·10분·선행 T032,T039,T040: frontend/src/components/console/RoutingEvidenceCard.tsx와 frontend/src/components/console/PolicyChangeCard.tsx에 후보별 처리 이유·발췌·URL·기준일/시행일·신뢰·변경 항목을 표시하고 상담사의 최종 선택을 T033에 연결한다. 출처 미확인은 날짜를 지어내지 않고 표시한다.
- [ ] T042 [US3] AI2·10분·선행 T039,T040,T041,T023,T031: frontend/tests/integration/us3-policy-handoff.test.ts에서 기후동행카드 시나리오의 두 일정 변경·티머니/정책과 후보 및 수도 분야 낮은 신뢰·부서 미생성을 실제 API/콘솔 payload로 확인한다.

## Phase 8: Polish & Cross-Cutting — 제출 검증과 백업

**Goal**: 다섯 여정을 통합하고 실제 제출 주소에서 검증한다. SC-011·014만 후순위이며 새 기능으로 필수 오류를 덮지 않는다.

- [ ] T043 AI3·10분·선행 T023,T031,T033: frontend/tests/integration/recovery-security.test.ts에서 재시작·진행 중 요청 폐기·지연 모델 중 연결·동일 commandId·stale revision·다른 세션 접근·콘솔 인증·토큰/원문 로그 미노출을 실행하고 docs/recovery-validation.md에 결과를 남긴다.
- [ ] T044 [P] AI2·15분·선행 T025,T037,T042: frontend/scripts/test-golden.ts와 frontend/tests/integration/golden-turns.test.ts에서 demo/golden-turns.json의 기존 3시나리오·필수/금지 표현·확인 상태·콘솔 데이터를 검증한다. data/golden-report.json에 live 결과와 모델 fixture 결과를 구분한다.
- [ ] T045 [P] FE·15분·선행 T028,T032,T041,T023,T033: frontend/tests/e2e/consultation.spec.ts와 frontend/tests/e2e/console.spec.ts에서 텍스트 대체 세 시나리오·명시 요청 18조건·1번 입력창 예외·한 항목 수정·지연/실패·중립 카드·항상 보이는 연결을 검증한다.
- [ ] T046 [P] AI1·15분·선행 T018,T025,T039: frontend/scripts/test-generalization.ts에서 고정한 독립 15문항·미확보 분야 3/구 3·복합 문의·무근거·검색 자격을 실행하고 data/generalization-report.json과 data/corpus-freeze.json에 자료 버전·hash·결과를 동결한다. SC-020 별도 버전 결과도 기존 자료와 구분한다.
- [ ] T047 AI3·20분·선행 T004,T043,T044,T045,T046,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023,T024,T025,T026,T027,T028,T029,T030,T031,T032,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042: frontend/deploy/ecosystem.config.cjs와 docs/deployment-runbook.md에 장기 실행 Node 1 replica·HTTPS·지속 DATA_DIR·보호된 콘솔·환경변수·재시작/이전 빌드 복구 절차를 구성하고 보유 제출 환경에 같은 빌드/자료 버전을 배포한다. 계정·권한·주소가 없으면 이를 차단 사유로 기록하며 임의 구매나 서버리스 메모리 대체를 하지 않는다. 현재 frontend/next.config.ts에 Cloud Run 프록시가 있다는 사실과 실제 Vercel/Cloud Run 배포 성공은 구분한다. T010에서 확인한 API/상태 저장 경계와 일치하는 배포만 검증한다.
- [ ] T048 FE·10분·선행 T047,T029: docs/submission-validation.md에 제출 HTTPS의 서로 다른 브라우저 세션에서 한국어 음성·텍스트·콘솔 전달·새로고침·AI3의 서버 재시작 복구를 확인하고 URL·빌드·corpus 버전·접근/성공/실패를 기록한다. localhost 성공과 영상만으로 통과시키지 않는다.
- [ ] T049 FE·10분·선행 T048: docs/usability-validation.md에서 팀 외 검토자 1명 이상에게 문의 시작·텍스트·사람 연결·요약 승인/부분 수정을 별도 설명 없이 찾게 하고 결과를 기록한다. 실제 정보 약자 대상 검증·접근성 인증으로 확대 주장하지 않는다.
- [ ] T050 AI2·10분·선행 T044,T048: demo/recordings/와 demo/rehearsal.md에 세 시나리오 영상·시나리오2 오프라인 백업·3분 내부 리허설 결과를 준비하고 가상 민원·정책 자료·모의 지표·실제 제출 화면 여부를 검수한다. 공식 발표 시간/제출 규정은 확인된 내용만 반영한다.
- [ ] T051 AI3·10분·선행 T036,T037,T043–T050: docs/acceptance-report.md와 specs/001-civic-consultation-handoff/quickstart.md에 명령·SC별 증거·미통과/미실행·배포 URL·모델/자료 버전·후속 항목을 기록하고 npm test/build를 최종 변경에 맞춰 통과시킨다. 성공한 작업만 이 파일에서 체크하며 미검증 달성 주장은 하지 않는다. 문서 수준 재검토는 구현 성공이 아니며 실제 빌드·자료·배포·모델 시험 결과가 없는 항목을 완료 처리하지 않는다.

## Dependencies & Execution Order

### Phase Dependencies

- T001 이후 T002/T003/T004와 T005의 공통 타입 작업을 병행한다. 전체 Phase 2를 모든 작업의 공통 대기 조건으로 두지 않고, task별 최소 선행 조건으로 자료 수집·모델·화면 fixture를 먼저 진행한다. live API는 인증·저장·라우트를 갖춘 뒤 통합한다.
- Phase 번호는 우선순위별 문서 배치다. 다른 여정에서 fixture로 독립 구현 가능한 작업은 아래 DAG의 명시 선행을 만족하면 병행한다.
- US1은 단독 안내 증분, US2는 fixture 기반 이관 정책, US4는 fixture 기반 음성 제어, US5는 fixture 기반 콘솔로 독립 검증 가능하다. 실제 제출은 모든 live 통합이 필요하다.
- US3는 P2지만 시나리오2의 제출 필수 근거다. US1의 초기 일반 검색에서 현재 유효성·미검증 필터는 이미 적용하고, 세부 변경 이력·창구 순위 통합을 US3에서 완성한다.
- US2 T023은 US5 T031 전달 서비스에 연결해 완성한다. US5 fixture 개발이 US2 live 완료를 기다리지는 않는다.
- T039의 claim별 교체 완료 전 SC-003/정책 시연을 통과한 것으로 간주하지 않는다. T036 승인·회귀 완료 전 개선 자료를 게시하지 않는다.
- 최종 검증은 통합 후 실행하고 제출 검증은 실제 제출 환경 확보 이후에만 완료 처리한다.

### Dependency Graph

```text
T001 -> {T002, T003, T004} -> Foundation(T005..T010)
공통 타입/문서 스키마 -> US1 자료·모델·화면 fixture, live API는 T010 뒤
Foundation -> US1(T011..T018)
           -> US2(T019..T025) --전달 서비스--> US5(T030..T037)
           -> US4(T026..T029) --live UI-----> US1 + US2
           -> US5(T030..T037) --창구 통합---> US3(T038..T042)
US1 데이터 -> US3 변경/창구, US5 개선 별도 버전
US1..US5 -> T043..T046 -> T047 -> T048 -> {T049,T050} -> T051
```

이 그래프는 여정 간 연결 개요이며 실제 실행은 각 task의 선행 목록을 따른다. T002 실모델과 T004 제출 환경이 실패하면 개발 가능한 fixture 작업은 진행하되 live/배포 완료는 차단 상태로 남긴다.

### Parallel Opportunities and File Ownership

| 시점 | FE | AI1 | AI2 | AI3 |
| --- | --- | --- | --- | --- |
| 공통 기반 뒤 | T017 시민 텍스트 | T011–014 근거 | T015 해석/답변 | T016/정책 기반 |
| 안내 증분 뒤 | T024 요약 카드 | T038–039 대체 관계 | T020/T022 항목/요약 | T019/T021/T023 정책/API |
| 인계 통합 | T026–029 음성, T032 콘솔 순차 | T035–036 개선 | T040 창구/독립 평가 | T030–034 큐/처리/지표 |
| 최종 검증 | T045 E2E | T046 일반화 | T044 회귀 | T043 복구 후 T047 배포 |

frontend/src/lib/contracts.ts, package.json, snapshot/event/정책 공통 파일은 AI3 한 명이 수정한다. 다른 담당자가 같은 파일 변경을 필요로 하면 소유자에게 요청하고 자신의 branch/workspace에서 중복 편집하지 않는다. T014와 T039의 검색 통합, T017과 T028의 page 통합 등 동일 파일 단계는 같은 담당자가 순차 처리한다.

## Parallel Examples per User Story

- US1: 기반 완료 후 T011/데이터와 T015/모델, T017/화면을 다른 담당자가 병행한다. live T016은 T014·T015를 기다린다.
- US2: T019/정책 시험과 T020/항목, T024/요약 화면은 병행한다. T021은 T020, T023은 T021·T022, 전체 완료는 T031을 기다린다.
- US4: FE의 T026→T027→T028은 순차다. 이 동안 AI3의 T023과 AI1의 T039는 다른 파일에서 병행할 수 있다. FE 한 명에게 음성/콘솔 동시 작업을 할당하지 않는다.
- US5: T030/큐 시험, T032/콘솔, T035/개선 후보는 서로 다른 파일에서 병행한다. T037은 live API·화면·지표가 준비된 뒤 실행한다.
- US3: T038→T039/문서 관계와 T040/후보 모델은 병행한다. T041은 데이터·후보를 기다리고 T042에서 실제 이관과 검증한다.

## Implementation Strategy

### MVP First and Incremental Delivery

1. T001부터 시작하고 공통 타입 고정 후 네 담당자가 최소 선행 조건에 따라 병행한다. T001–T010의 결과와 실모델·제출 환경 차단 항목은 공유한다.
2. US1 텍스트 안내를 첫 증분으로 검증한다. 이후 대본 없는 문의를 계속 사용해 고정 응답을 방지한다.
3. US2+US5의 최소 요약·큐 수신을 연결하고 3시간 30분까지 제출 환경 첫 전구간 통합을 목표로 한다. 상세 지표·개선 마무리보다 이 경로를 먼저 연결한다.
4. US4 음성/대체 경로와 US3 정책/창구 근거를 통합한다. 문서 단계 순서 때문에 한 담당자가 다른 담당자의 모든 작업을 기다리지 않는다.
5. 3.5시간에 기본 데이터·기능 동결, 3.5–5시간은 피드백의 개선 1건·지표·정책/일반화·실패 경로 검증, 최신 290분 한도에서 215–265분은 최종 배포·검증·녹화·리허설, 265–290분은 오류 수정 여유로 배정한다.
6. 최소 제출 MVP는 US1만이 아니라 다섯 여정의 필수 연결·근거·포용성·개선/계측이다. SC-011 성능 대량 측정·SC-014 폭넓은 신규 분야 시험·선택 음성 끼어들기는 이번 필수 task로 늘리지 않는다.

### Time Budget

아래 작업시간과 4인 시간표는 마지막 290분 알림 때의 기존 계획값이다. 이번 진행 현황 반영으로 시간을 다시 시작하거나 새로운 잔여시간을 확정하지 않는다. T001/T004에서 선행 완료된 초기화·스타일 준비를 다시 수행하거나 중복 산정하지 않는다. 남은 환경 설정·서비스 화면·연동·실행 검증 기준을 만족한 시점에 해당 task를 완료로 체크한다.

| 담당 | 작업 수 | 순수 작업 예상 | 290분 대비 개인 여유 |
| --- | --- | --- | --- |
| FE | 12 | 165분 | 125분 |
| AI1 | 11 | 165분 | 125분 |
| AI2 | 12 | 160분 | 130분 |
| AI3 | 16 | 230분 | 60분 |

총 51개, 병렬 표시 22개다. 공통 작업 19개와 US1 8개·US2 7개·US4 4개·US5 8개·US3 5개로 구성한다. 순수 작업 예산은 총 720인·분이며 의존 대기·외부 계정 지연을 포함한 실제 290분 내 완료 보장은 아니다. AI3가 병목이므로 T031을 T023보다 먼저 실행하고 T034 지표 마무리보다 첫 이관 통합을 우선한다.

겹치는 시험 표본은 SC별 결과를 따로 남기면서 재사용한다. 예상보다 지연되면 신규 문서 수 목표·시각적 고도화·별도 통계 화면을 줄이고 명시적 사람 연결·일반 문의·근거 검증·확인/미확인·배포 증거를 남긴다. 필수 기준 미달은 scope를 몰래 변경하지 말고 미완료로 보고한다.

### 4인 병렬 실행 일정 — 남은 4시간 50분 기준

공통 타입 이후 대기 장벽을 없애고 실제 선행 조건만 적용한 자원 제약 일정이다. 같은 담당자는 동시에 한 task만 실행하며, 다른 담당자와 파일이 겹치지 않는 작업만 병행한다. 각 작업의 단축 예상시간은 기존 문서 재사용·AI 보조·한 번에 통과하는 조건의 목표치다. 실제 측정 결과가 아니며 키·배포 계정 미확보와 오류 수정은 아래 여유 시간에서 처리한다.

| 담당 | 겹치지 않는 작업 배치(시작–종료, 경과시간) |
| --- | --- |
| FE | T004 0:10–0:25; T017 0:25–0:45; T024 0:45–1:00; T026 1:00–1:10; T027 1:10–1:30; T028 1:30–1:40; T029 1:40–1:50; T032 1:50–2:10; T041 2:30–2:40; T045 2:55–3:10; T048 3:55–4:05; T049 4:05–4:15 |
| AI1 | T003 0:10–0:20; T009 0:25–0:35; T011 0:35–0:45; T012 0:45–1:25; T013 1:25–1:40; T014 1:40–2:00; T035 2:00–2:10; T038 2:10–2:20; T039 2:20–2:30; T046 2:50–3:05; T036 3:05–3:20 |
| AI2 | T002 0:10–0:20; T008 0:25–0:40; T015 0:40–1:00; T020 1:00–1:15; T022 1:15–1:30; T040 1:30–1:45; T018 2:20–2:35; T025 2:40–2:50; T042 2:50–3:00; T037 3:10–3:20; T044 3:20–3:35; T050 4:05–4:15 |
| AI3 | T001 0:00–0:10; T005 0:10–0:25; T006 0:25–0:40; T007 0:40–0:50; T010 0:50–1:10; T030 1:10–1:20; T031 1:20–1:35; T019 1:35–1:45; T021 1:45–2:00; T016 2:00–2:20; T023 2:20–2:40; T033 2:40–2:55; T034 2:55–3:10; T043 3:10–3:20; T047 3:35–3:55; T051 4:15–4:25 |

- 서버의 첫 요약/이관 API 통합 목표: 2시간 40분(T023).
- 화면을 포함한 live 전구간 검증 목표: 3시간 10분(T045).
- 제출 최종 빌드 배포 목표: 3시간 55분(T047), 실제 제출 환경 검증 4시간 5분(T048).
- 녹화·검토·최종 보고 목표: 4시간 25분(T051). 최신 남은 시간 4시간 50분에서 목표 종료까지의 여유는 25분이다. 오류 수정·실제 네트워크/배포 지연·추가 리허설은 이 25분을 사용한다. 담당자별 개인 여유를 전체 일정 여유로 합산하지 않는다.
- 총 작업량 720인·분을 4로 나눈 값을 완료시간으로 사용하지 않는다. 위 265분은 선행 관계와 담당자 중복 금지를 반영한 예시 일정이며, 290분 내 성공 보장은 아니다.

대기 중 정정 재전달은 기존 T023·T024·T031·T037·T043 범위에서 구현/시험하며 최신 전달 revision·변경 표시·이전 이력을 보존한다. 새로운 상담사 채팅 기능은 추가하지 않는다.

### Acceptance Trace

| 기준 | 작업 |
| --- | --- |
| SC-001 | T044 |
| SC-002 | T011,T014,T018 |
| SC-003 | T038,T039,T042 |
| SC-004–006 | T019,T021,T025,T045 |
| SC-007 | T027–T029,T045,T048 |
| SC-008–009 | T022–T025,T030,T031,T037,T043 |
| SC-010 | T040–T042 |
| SC-011 | 후순위, 미실행 시 T051에 기록 |
| SC-012 | T050 |
| SC-013 | T018,T046 |
| SC-014 | 후순위, 구조 확장은 T013/T035–T036으로 보존 |
| SC-015 | T018,T046 |
| SC-016 | T020,T025 |
| SC-017 | T004,T028,T049 |
| SC-018 | T019,T021,T025 |
| SC-019 | T019,T022,T025 |
| SC-020 | T035,T036 |
| SC-021 | T033,T034,T037 |
| SC-022 | T017,T024,T032,T045 |
| SC-023 | T004,T047,T048 |
| SC-024 | T024,T028,T032,T033,T045,T048 |
| SC-025 | T014,T015,T018,T020,T044,T046 |
| SC-026 | T023,T024,T031,T037,T043 |

## 보완 결과와 구현 게이트

헌법 추적: I(시민 선택·포용)는 T017·T019·T021·T024·T027–T029·T045·T049, II(근거)는 T009·T011–T015·T038–T042·T046, III(맥락)는 T020·T022–T025·T031·T037·T043, IV(AI/사람 판단)는 T008·T021·T033·T035–T036·T040, V(검증)는 T034·T037·T043–T051에 연결한다. 데이터 보호는 T001·T006–T007·T035·T043, 제출 환경 게이트는 T010·T047–T048에서 증명한다. 사전 모델 확인은 T002의 0:10–0:20 일정과 동일하게 시작 20분 안을 목표로 한다. 기존 51개 ID·담당·예상시간은 유지한다.

- 기존 51개 작업과 사용자 여정별 분류·담당·시간·선행 순서를 유지했다. 주요 변경은 태스크 본문 제약 인용·매우 불만 생략·전달 후 정정·집계/식별·상태 매핑이다.
- 모든 구현 스키마는 data-model.md의 직접 참조를 사용한다. 후보 없음 사유는 RoutingResult, 전달 수신 버전은 Handoff, 목적별 지역은 Issue의 소유로 고정했다.
- 첫 증분은 US1 텍스트 안내지만 전체 최소 제출 범위는 US1·US2·US4·US5·US3의 필수 기능이다. 각각의 Independent Test와 SC 추적표를 통과해야 한다.
- 정합성 점검의 지적 사항은 위 정의로 정리하되 실제 모델/호스팅/자료 접근·음성 동작은 구현 시 증거를 남겨야 한다. 헌법은 `.specify/memory/constitution.md` v1.0.0으로 제정되었다. 이 게이트는 문서 정합성 확인이며 실제 동작은 각 task의 시험 증거로 판단한다.

## Notes

- 코드 진행 반영 결과: 선행 기반 완료 항목은 위 표에 기록했고 T001·T004는 부분 완료다. 원래 task의 모든 조건을 충족한 증거가 없어 이번 확인만으로 체크박스를 완료로 바꾸지는 않았다. 서비스 기능/시험의 미완료 상태와 기존 51개 ID·담당·병렬 순서는 유지한다.

- T005/T009/T020/T022/T031/T033/T035/T040의 data-model.md 인용은 구현 task의 직접 참조다. nullable·enum·범위·ID·고유성·승인/게시 조건을 임의로 재정의하지 않는다.
- 원문 검증과 실제 시험·배포는 구현 때 수행할 작업이다. 현재 task 체크는 모두 미완료로 둔다.
- before_tasks/after_tasks 확장 훅은 .specify/extensions.yml 존재 여부를 확인하고, 없으면 실행 없이 완료한다.
