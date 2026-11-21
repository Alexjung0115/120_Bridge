# T043 복구·접근 검증

PR #40 병합본(2e54d44)에서 로컬 PGlite와 Node 테스트로 실행했다. 27건 통과, 실패 0건. 모델 호출은 없었다.

```powershell
Set-Location frontend
npx tsx --test tests/integration/store-recovery.test.ts tests/integration/auth-limits.test.ts tests/integration/mvp-demo.test.ts tests/contract/sessions.test.ts tests/contract/citizen-handoff.test.ts tests/unit/handoff-policy.test.ts
```

| 항목 | 확인한 결과 |
| --- | --- |
| 복구 | DB 재개방 뒤 세션 스냅샷과 명령 영수증을 읽었다. 영수증 저장 실패는 스냅샷도 롤백했다. |
| 경합·재시도 | 동일 baseRevision에 대한 동시 쓰기 중 하나만 저장됐다. 중복 승인, 오래된 요약, 정정 재전달, 상담사 수락 이후 정정 충돌을 검증했다. |
| 접근·로그 | 세션 간 토큰 격리, 콘솔 인증 실패, 응답 캐시 금지, 진단 로그의 키·토큰·원문 미노출을 검증했다. |
| 미실행 | 진행 중 모델 요청의 재시작 폐기와 실 모델 응답 지연 중 이관 선점은 통합 실행하지 않았다. 정책 우선순위 단위 시험은 통과했다. 원격 Supabase/Vercel에서의 재시작 복구도 미실행이다. |

T043은 통과한 경로의 증거만 기록한다. 미실행 경로의 검증이 남아 있다.
