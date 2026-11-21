# Phase 0 Research — 120 브릿지

날짜: 2026-11-21. 명세와 기존 파일 감사 및 공식 문서 확인에 따른 설계 결정이다. API 호출·음성·검색 성능 실험은 아직 하지 않았다.

## 1. 단일 TypeScript 앱

- Decision: Next.js App Router, 장기 실행 Node 서버 하나, 동일 origin의 두 화면과 HTTP 경로.
- Rationale: 프런트 1명이 화면과 타입을 공유하고 AI3가 서버를 맡을 수 있다. 개발은 localhost, 피드백 반영 제출 환경은 HTTPS 단일 인스턴스로 유지해 세션 공유의 복잡도를 낮춘다.
- Alternatives considered: FastAPI+별도 프런트는 언어·배포·계약이 두 벌, 서버리스 메모리는 상태 유지 전제를 충족하지 않음.
- Sources: [설치](https://nextjs.org/docs/app/getting-started/installation), [self-hosting](https://nextjs.org/docs/app/guides/self-hosting). 정확한 패키지 버전은 구현 시 설치 결과와 lockfile로 기록.

## 2. 음성

- Decision: Chrome SpeechRecognition(지원 시 webkit 접두사 포함)과 speechSynthesis, ko-KR, 기능 탐지 후 텍스트 대체.
- Rationale: 브라우저 음성 기능을 재사용하되 지원·권한·네트워크 실패에 의존하지 않는 입력 경로를 둔다. 브라우저 인식이 항상 로컬 처리된다고 주장하지 않는다.
- Alternatives considered: 별도 음성 서버·실시간 전화망은 6시간 범위를 초과. 텍스트만 구현하면 필수 음성 수용 조건 미달.
- Source: [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API).

## 3. 검색과 근거 판정

- Decision: 문단/표 단위 청크, 관할·시점·검증 필터 → 한글 정규화 문자 n-gram/키워드 랭킹 → 상위 5청크의 답변 가능성 검증. LLM은 청크 ID와 인용 발췌만 참조.
- Rationale: 36문서에서 외부 임베딩 서비스 없이 첫 통합 가능. 단순 키워드 점수의 한계를 인정하고 없는 질문·상충·타 구 문서를 독립 시험한다. 대본 문자열 자체를 라우팅 키로 쓰지 않는다.
- Alternatives considered: 임베딩은 실제 한국어 검색 품질·비용·지연 확인 후 고도화, 전체 문서 투입은 관할·대체 통제가 불명확해 채택하지 않음.
- Calibration: 개발용 양성/음성/타 관할 표본 각 5건으로 임계값을 선택하고 고정한다. 어떤 임계값도 양성 근거를 살리며 음성을 모두 차단하지 못하면 검색 실패를 숨기지 않고 검색 개선 후 재검증한다. SC-013 독립 15문항은 조정용으로 사용하지 않는다.
- Effective dates: 게시일·수정일은 시행일이 아니다. 날짜 모르는 문서는 null+상태 보존. 유효 기간은 [from, until)이며 당일 변경은 Asia/Seoul 기준. 대체 항목의 claimKey를 추적하고 미변경 업무분장은 별도 유지한다.

## 4. LLM 후보와 결정 규칙

- Decision: OpenAI Responses REST structured output을 기본 어댑터로 설계. 팀이 사용 가능한 모델 ID는 OPENAI_MODEL 환경변수이며 시작 15분에 스키마 지원·한국어·지연을 확인한다. 스키마는 Zod로 서버에서 재검증한다.
- Rationale: 출력 형태를 고정해도 의미·출처 정확성은 보장되지 않으므로 서버가 문서/청크/인용/관할·유효성을 별도로 검사한다. 실제 키 사용 가능성은 아직 확인하지 않았다.
- Alternatives considered: 자유 텍스트 JSON 추출은 불안정, 다중 모델 라우팅은 통합 범위를 키움. 팀 키가 다른 제공자만 있으면 어댑터만 교체하고 내부 계약은 유지한다.
- Source: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). 모델명·가격·처리량을 추측해 고정하지 않는다.
- Handoff: 명시 요청은 서버에서 먼저 처리하고 LLM 해석도 보조로 수용하되 부정문 “상담사 말고 안내해 주세요”는 문자열 단독 감지로 연결하지 않는다. 모델 실패여도 버튼·1번 키 연결은 동작한다.

## 5. 수집

- Decision: 기존 원문 링크 중심 수작업+목록 기반 반자동 수집. 검색은 출처 발견 용도로만, 답변용 근거는 공식 원문과 검증 발췌.
- Rationale: 기존 검증 기록 6건/미검증 30건. 신규 대량 수집보다 출처 대조와 항목별 변경 관리가 시연 실패 위험을 줄인다.
- Alternatives considered: 자치구 전체 무차별 크롤링·유료 검색·전문 민원 데이터 연동은 승인·정제·갱신 부담 때문에 후속.
- Sources: [120 전화상담](https://www.120dasan.or.kr/dsnc/main/contents.do?menuNo=200016), [마포구 안내](https://www.mapo.go.kr/site/main/content/mapo05060502), [정책 Q&A](https://mediahub.seoul.go.kr/archives/2019060), [서울 열린데이터광장](https://data.seoul.go.kr/).
- Limits: 열린데이터광장은 후속 발견 경로이며 당장 쓸 특정 API 데이터셋이나 키 확보를 확인한 것은 아니다. 이번 문서 작성 중 일부 공식 페이지를 열었지만 기존 36건 전체를 재검증한 것으로 처리하지 않는다.

## 6. 상태·접근과 실패

- Decision: 단일 서버 JSON 스냅샷, 서버 직렬 명령, revision·idempotencyKey, 콘솔 1초 polling. 세션별 토큰과 콘솔 전용 환경 토큰. 로컬 개발 후 피드백 7절에 따른 제출 HTTPS 인스턴스에서 동일하게 검증.
- Rationale: 메모리만 사용하면 새로고침이 아닌 프로세스 재시작에서 기록 소실. 스냅샷으로 시연 복구하되 다중 프로세스 공유는 지원하지 않는다.
- Alternatives considered: Redis/Postgres/운영 로그인은 후속 도입 시 별도 설계. 비인증 공개 콘솔은 채택하지 않음.
- Defaults: 발화 2,000자·세션 100턴·최대 5세션. 초과는 기록 삭제 대신 제한 안내와 이관/종료 경로. 모델 timeout 10초·복구 1회, 요약 대기 30초는 자동 승인이 아닌 수동 미확인 인계 버튼 노출.

## 7. 현직자 피드백 반영 결정

- Decision: 제출 환경을 HTTPS 단일 장기 실행 Node 인스턴스+지속 디스크로 지정한다. 기존 localhost-only는 개발/백업으로 한정한다. 별도 DB보다 현재 단일 서버 설계를 유지하는 선택이며 공개 배포에서는 가상 데이터·콘솔 인증·요청 제한을 필수로 한다.
- Rationale: feedback-report.pdf 3쪽에 제출 배포 환경 심사가 명시되어 있다. 로컬 두 탭 성공만으로 완료하지 않는다. 실제 호스팅 자격·제출 URL은 시작 시 검증할 전제다.
- Alternatives considered: 서버리스 메모리 유지 불가, Redis/Supabase 전환은 서버 다중화가 필요한 후속 도입 때 검토. 여러 선택지를 동시에 구현하지 않는다.
- Decision: 상담사 결과는 개선 후보로만 수집하고 수동 검증·승인·회귀 후 자료 버전에 반영한다. AI 내 단순 문의 안내는 유도하되 명시적 연결을 방해하지 않는다.
- Rationale: AI 해결 범위 확장과 상담사 부담을 함께 확인할 수 있고 검증되지 않은 상담 결과의 자동 학습을 피한다. 자동 모델 재학습이나 인력 절감 수치는 이번 MVP에서 주장하지 않는다.
- Decision: 매우 불만+연결 의사 확인 시 요약 승인을 생략해 unconfirmed로 전달한다. 일반 불만·기존 수도 시연은 기본 확인 경로를 유지한다.
- Source: 사용자 제공 현직자 피드백 3쪽 전체. 피드백 안의 0번·20~30건·팀 역할은 과거 기획 맥락이며 이후 확정한 사용자 결정을 덮어쓰지 않는다.
