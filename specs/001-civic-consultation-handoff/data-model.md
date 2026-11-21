# Data Model — 120 브릿지

시각은 ISO 8601, 날짜는 YYYY-MM-DD 또는 null. 서버 생성 ID는 UUID, docId는 기존 상대 문서 경로. schemaVersion=1. 문자열 “미확인”은 저장 시 null과 상태로 분리하고 화면에서 표시한다.

## Session

id, revision(integer>=0), createdAt, updatedAt, citizenTokenHash, state, activeIssueId|null, issueIds[], transcript[], handoffId|null, pendingRequestId|null, corpusVersion, businessDate.

state = active | handoff_offered | summary_confirm | sending | queued | serving | transferred_demo | completed_demo | ended | delivery_failed.
UI 듣는 중/답변 중은 세션의 서버 상태와 별개 클라이언트 표시다. 토큰은 원문으로 저장하지 않는다.

## Issue

id, sessionId, order, citizenRequest, intent(문의|민원접수|상담사요청|기타), category(자유 확장 문자열), jurisdiction, fields, questionCounts, lowConfidenceStreak, noEvidenceQuestionCount, status(pending|active|advised|unresolved), sourceChunkIds[], alreadyTold[], candidateIds[].

fields는 키별 value|null, status(known|unknown|declined), originTurnId, confirmed를 가진다. questionCounts는 필드별 0..2, noEvidenceQuestionCount는 0..1이다. 필수 정보 확인은 lowConfidenceStreak를 늘리지 않는다. 한 번에 active 항목 하나, advised는 행정 처리 완료가 아니다.

복합 항목은 독립 요구별로 분리하되 시나리오 2처럼 동일 사안의 정책 안내와 개인 입금 처리는 같은 Issue의 하위 요구로 보존 가능하다. 요약에서 둘 중 하나를 누락해서는 안 된다.

## Turn

id, sessionId, sequence, role(citizen|assistant|system), inputMode(voice|text|button|key), text, timestamp, issueIds[], outputStatus(pending|committed|discarded), factCitations[].

시민 승인 “네”도 원문에 남긴다. 늦은 모델 응답은 discarded로 표시하고 시민에게 재생하지 않는다. 요약 확인의 네와 안내 종료의 네는 서버 상태에 따라 구분한다.

## Document / Chunk / Replacement

Document: docId, sourcePath, title, category, jurisdiction, sourceUrl, retrievedAt, publishedAt|null, updatedAt|null, effectiveFrom|null, effectiveUntil|null, dateStatus, sourceVerifiedAt|null, verificationStatus(verified|historical|unverified|blocked|conflict), sourceHash, chunks[].

Chunk: chunkId, docId, heading, text, claimKeys[], verifiedClaims[], answerEligible, routingEligible, conflicts[].
Citation: chunkId, claimKey, quote, sourceUrl, basisDate|null, basisDateType. quote는 실제 청크의 부분 문자열이어야 한다.

Replacement: id, predecessorDocId, successorDocId, claimKey, before, after, validFrom|null, validUntil|null, evidenceChunkIds[].
[validFrom, validUntil) 적용. 다른 claim에 대체를 전파하지 않는다. 검색 점수와 별개로 유효성·관할 필터는 필수다.

## Candidate

id, issueIds[], rank(1|2), name, purpose, reason, evidence[], confidence(high|low), selectedByAgent.
최대 두 후보는 미해결 문의를 기준으로 한 상담 건 전체 추천이다. 근거 부족 시 0개+unknownReason 가능. 조직 부서명은 근거 없으면 생성 금지. 수도 분야 상담은 일반 120 안내 근거로 낮은 신뢰 표시.

## Summary / Handoff

Summary: id, revision, sessionRevision, coreLines(max 3), issueSummaries[], alreadyTold[], missingFields[], reason, sentiment(보통|불만|매우불만|unknown), sentimentIsEstimate=true, confirmation(pending|confirmed|unconfirmed), confirmedAt|null, skipReason|null, fieldConfirmations[].

Handoff: id, sessionId(unique), summaryId, summaryRevision, unresolvedIssueIds[], resolvedContextIds[], transcriptSnapshot, candidates[], idempotencyKey, status(sending|queued|serving|transferred_demo|failed), receivedAt|null, selectedCandidateId|null.

전송 전에는 최신 Summary revision의 승인 또는 명시적 생략/확인 불가/매우 불만+연결 의사 정책의 생략 근거가 필요하다. 생략은 unconfirmed·skipReason으로 저장한다. 미확인 정보와 요약 미승인은 별개: 필드가 미확인이어도 시민이 그 요약을 승인할 수 있다.

## 상태 전이와 동시성

추가 필드: Session.outcome = ai_confirmed|handoff|unknown, outcomeConfirmedAt|null. Handoff.agentId|null, claimedAt|null, completedAt|null, resolutionNote|null, repeatExplanationCount|null. AI 완료는 모든 문의 항목에 시민의 안내 완료 확인이 있고 이관이 없을 때만 설정한다. 종료만 있고 확인이 없으면 unknown이다.

ImprovementCandidate: id, sessionId(접근 제한 참조), gapReason, category, jurisdiction, redactedResolution, proposedSourceUrls[], status(open|verified|approved|published|rejected), reviewer|null, approvedAt|null, publishedCorpusVersion|null, regressionResult|null. 원 대화·연락처를 일반 개선 파일로 복사하지 않는다. approved와 회귀 통과 모두 있어야 published 가능하다.

MetricEvent: id, sessionId, eventType, timestamp, actorPseudonym|null, reason|null, measurementMode=simulation, corpusVersion. eventType은 ai_resolution_confirmed|handoff_requested|queue_received|agent_claimed|case_completed|repeat_explanation_recorded|session_ended. 동일 이벤트 키를 중복 집계하지 않는다. 원문 텍스트 없이 집계한다.

대기 상태의 경과 시간은 서버 타임스탬프에서 계산하고 30초 후 delayed 표시만 추가한다. 데이터 상태 queued 자체를 임의 완료로 바꾸지 않는다. serving 또는 transferred_demo에서 명시적 complete_case로 completed_demo 전환하며 이 시점에만 상담사 완료 지표에 포함한다.

1. active → handoff_offered: 낮음 2회/매우 불만/근거 없음 보완 1회/같은 필수 정보 2회. 거절 시 active, 동일 질문 반복 금지.
2. active 또는 handoff_offered → summary_confirm: 명시 요청 최우선 또는 제안 수락, 개인 처리의 정보 충족. FR-033이면 summary_confirm을 거치지 않고 unconfirmed 요약과 사유를 기록해 sending으로 전환한다. 진행 중 모델 요청 취소/세대 번호 변경.
3. summary_confirm → summary_confirm: 수정 후 revision 증가·confirmation=pending.
4. summary_confirm → sending: 최신 요약 confirm 또는 명시적 skip. 불만 추정만으로 confirmed를 만들지 않는다.
5. sending → queued: 스냅샷과 고유 대기열 항목 저장 성공 후 receivedAt 설정. 실패는 delivery_failed, 같은 키로 재시도.
6. queued → serving → transferred_demo: 상담사 액션만 허용. ended는 안내 종료 시 이관 없는 종료.
7. 세션 명령은 baseRevision 확인 후 직렬 처리. 409 시 최신 상태를 읽고 사용자 입력 보존. 모델 대기 동안 전체 세션 락을 잡지 않는다. 서버 재시작 시 pending 모델 호출은 취소·재시도 상태로 복구한다.
