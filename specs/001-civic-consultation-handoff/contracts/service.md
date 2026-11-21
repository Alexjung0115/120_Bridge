# Service Contract v1

클라이언트는 서버 상태를 표시한다. API base=/api, JSON UTF-8. 서버는 서버 전용 Zod 타입에서 요청/응답·LLM 스키마를 함께 파생한다. 아래 계약을 먼저 구현하고 fixtures는 같은 계약을 사용한다.

## 공통·접근

성공: {schemaVersion:1, requestId, data}. 오류: {schemaVersion:1, requestId, error:{code,message,retryable}, currentRevision?}.
400 형식 오류, 401/403 토큰 오류, 404 세션 없음, 409 revision/stale summary/중복 실행 충돌, 429 요청 제한, 503 모델·전송 불가.
생성 응답의 citizenToken은 해당 세션 호출의 Authorization: Bearer에만 사용한다. 콘솔은 별도 CONSOLE_TOKEN, 모든 응답 Cache-Control:no-store. API 키는 서버 환경에만 둔다.
command마다 commandId(UUID)와 baseRevision 필요. 동일 commandId 재전송은 기존 결과를 반환하며 명령을 재실행하지 않는다.

## HTTP

| Method / path | 입력 | 결과 |
| --- | --- | --- |
| POST /sessions | {clientSessionKey, inputMode} | {sessionId,citizenToken,revision,state} |
| GET /sessions/:id | 시민 토큰 | 시민용 snapshot, 내부 토큰·프롬프트 제외 |
| POST /sessions/:id/turns | {commandId,baseRevision,text,inputMode} | {turnId,revision,state,processing,utterances[],cards[],issues[],summary?} |
| POST /sessions/:id/handoff-request | {commandId,baseRevision,trigger:voice\|button\|key} | 기본 summary_confirm, FR-033 조건이면 sending/queued와 unconfirmed summary |
| POST /sessions/:id/handoff-decision | {commandId,baseRevision,decision:accept\|decline} | state와 utterances |
| POST /sessions/:id/summary | {commandId,baseRevision,summaryRevision,action:confirm\|edit\|skip,correctionText?} | 수정된 summary 또는 delivery 결과 |
| POST /sessions/:id/handoff-retry | {commandId,baseRevision,handoffId} | 기존 handoff ID로 queued 또는 delivery_failed |
| GET /console/queue | 콘솔 토큰, cursor? | {items[],nextCursor}; sessionId별 유일 |
| GET /console/sessions/:id | 콘솔 토큰 | 전체 원문·요약·후보·변경 이력·항목별 상태 |
| POST /console/sessions/:id/actions | {commandId,baseRevision,action:claim\|transfer_demo\|complete_case,candidateId?,outcome?} | 상태·최종 선택; 실제 외부 전송 없음 |

세션 생성은 clientSessionKey로 네트워크 재시도 시 동일 세션 재사용. 생성 응답의 토큰 재전달은 서버의 세션 생성 결과 캐시에 한정하고 로그·스냅샷 평문 토큰 노출 금지.
turns는 모델이 10초 내 완료하면 최종 200, 대기 중 202+processing=true를 반환할 수 있다. 클라이언트는 동일 세션 GET을 1초 주기로 조회한다. handoff-request는 모델 완료를 기다리지 않고 상태 전이를 먼저 확정한다.
문자 입력 중 1번은 단축키로 처리하지 않는다. 입력창에 초점이 없고 상담 상태일 때만 key 이벤트를 보낸다. 음성의 상담사 요청도 서버가 intent·부정문을 검토하며 명시 버튼과 동등하게 처리한다.

## 시민 snapshot / 화면

revision, state, processing, activeIssueId, issues[{id,request,status}], transcript[], utterances[{id,text,maxSentences:2}], cards[], summary?, delivery?, error?.
cards는 evidence|information|summary. 사실 카드에는 citations[]와 basisDate 표시, 인사·확인 질문에는 가짜 근거 없음. 발화 id별 재생 여부를 기억해 polling 때 TTS 중복 방지.
한 번에 질문 하나. 요약은 coreLines와 숫자/날짜 확인 항목·승인·필드별 부분 수정·확인 없이 전달을 표시. summary edit는 correctionText 또는 changes[{fieldKey,value}]를 허용하고 수정하지 않은 필드·원문은 유지한다. 매우 불만+연결 의사 또는 명시적 생략은 낭독/승인 없이 unconfirmed·skipReason을 저장해 전달한다. 30초 경과는 미확인 전달 버튼을 드러낼 뿐 승인/전송을 자동 실행하지 않는다.
전송 성공 안내는 delivery.status=queued와 receivedAt 있을 때만. 연결 요청 접수·대기·지연·실패·종료를 색과 글자로 함께 표시한다. queued 30초 경과 후 아직 대기 중임을 표시하고 원문 보존·텍스트 계속/종료 경로를 제공한다. 일반 확인 카드는 중립 표시, 오류만 경고 표시다.

## LLM candidate (서버 내부)

### 피드백 반영 추가 계약

- POST /sessions/:id/outcome: 시민 토큰, {commandId,baseRevision,decision:resolved|need_more}. resolved는 모든 항목이 안내 완료인 경우에만 ai_confirmed로 종료한다. need_more는 active를 유지하며 이관을 강제하지 않는다.
- complete_case의 outcome: {resolutionNote,repeatExplanationCount|null,gapReason|null,proposedSourceUrls:[]}. 상담사 토큰으로만 실행, agentId는 인증된 콘솔 사용자 가명으로 저장한다. 원문은 기존 보호 영역에 두고 개선 후보의 기록은 개인정보를 제거한다. 실제 개인정보가 입력되면 공개 내보내기를 차단한다.
- GET /console/improvements: 콘솔 토큰, 개선 후보 목록. 데이터 검증·승인·버전 반영은 CLI/수동 파일 워크플로로 수행하고 공개 API 자동 게시 경로는 제공하지 않는다.
- GET /console/metrics: 콘솔 토큰, {measurementMode,windowStart,windowEnd,endedCount,aiConfirmedCount,unknownCount,handoffCount,handoffReasons,aiResolutionRate|null,handoffRate|null,agents:[{id,completedCount,observationMinutes,averageHandlingSeconds|null,sampleSize}],averageWaitSeconds|null,repeatExplanationCount,missingRepeatCount}. 비율·평균은 분모 0이면 null. 모의 표기 필수.
- summary의 fieldConfirmations는 {fieldKey,status:confirmed|unconfirmed,value} 배열이다. 전체 요약 미승인과 이미 확인한 개별 정보는 구별해 콘솔에 표시한다. 감정 추정·생략 사유도 원문 확인을 대신하지 않는다.
- handoff-request 응답이 sending/queued인 경우 시민에게 “확인 절차를 줄여 전달 중/전달했으며 상담사는 대기 중”을 구분해 알린다. 수신 실패면 자동 생략 경로도 delivery_failed로 남기고 재시도한다.

{intent, category, sentiment, issues:[{localId,request,knownFields,missingFields,needsPersonalLookup}], answerUnits:[{issueLocalId,text,citations:[{chunkId,claimKey,quote}]}], confidence:high|low, proposedQuestion:{fieldKey,text}|null, summaryProposal:{coreLines,issueSummaries}|null, routingEvidence:[{issueLocalId,chunkId,claimKey,quote}]}.

- additionalProperties=false, nullable 명시, 문자열·배열 길이 제한. 모델에는 순위·이관 최종 state 변경 권한 없음.
- 제공한 청크 집합 밖 ID/quote 불일치/대체된 claim/타 구/미검증 근거는 거절. 서버가 사용한 근거로만 카드와 출처 생성.
- 사실 안내의 각 낭독 단위는 이를 뒷받침하는 claimKey와 인용이 필요하다. 숫자·기한·연락처·적용 대상은 해당 검증 claim과 비교하고, 단순히 실제 문서 ID가 있다는 이유만으로 다른 조건의 값을 허용하지 않는다. 근거가 문장을 함의하는지 별도 판정하고 불확실하면 안내 대신 근거 부족 경로로 보낸다.
- 모델의 high만으로 답변 허용 금지. 근거 충분성 검사에 실패하면 no_evidence/오류 경로.
- coreLines<=3, utterance<=2문장, 이미 알려진 정보 재질문 금지. questionCounts·규칙·confirm 상태는 서버가 소유.
- 문서 내 지시·사용자의 규칙 무시 요청은 시스템 정책을 변경할 수 없음.
- 후보 생성 실패 시 미확인 원문 기반 요약으로 시민 확인은 가능하되 사실 안내는 생성하지 않음.

## 내부 모듈 경계

AI1 retrieve({query,issue,jurisdiction,businessDate,corpusVersion}) → {chunks,excluded,replacements,evidenceSufficient}.
AI2 interpretAndPropose({sessionSnapshot,input,retrieval}) → 검증 전 LLM candidate.
AI3 reduce({state,event,validatedCandidate}) → 상태·다음 이벤트·화면 snapshot.
retrieval query는 질문 의미와 기존 맥락을 사용하며 demo scenario ID를 받지 않는다. AI2의 추출→AI1 검색→AI2 답변은 필요한 경우 두 호출이지만 서버 정책 우회는 불가.
직접 10초 완료 기준은 각 모델 호출 timeout과 구분해 측정한다. 두 단계 호출로 초과하면 202 처리 상태를 반환하고 완료 후 polling으로 표시한다. 응답 지연을 감추려고 이전 상담의 답변을 재사용하지 않는다.
요약·개인 처리의 필수 필드는 자료의 절차와 문의 목적에서 결정하고 개인 계좌·주민번호는 수집하지 않는다.

## 회귀·데이터 계약

golden-turns.json은 기존 형식을 보존한다. 평가기에서 하위 항목을 취합해 expected intent/category/sources/stage를 검증한다. console.department_candidates는 화면 표기의 호환 별칭이며 내부 명칭은 candidates.
summary_confirm/sent_to_console은 기본 경로에서 각각 summary_confirm/queued로 매핑한다. 기존 수도 fixture의 불만은 일반 경로를 유지하며 매우 불만 생략은 별도 정책 시험으로 검증한다. 1턴을 여러 2문장 낭독으로 나눠도 transcript와 alreadyTold에 모두 보존한다. 고정 scenario 응답은 테스트용 fixture 모드에만 허용하고 live 완료 검증에서는 금지한다.
