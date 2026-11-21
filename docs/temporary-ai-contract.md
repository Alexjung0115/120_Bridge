# AI2 임시 연동 예시

<!-- TEMPORARY (#4/#5): 팀 계약과 검증된 RAG 근거를 연결하면 이 문서와 임시 테스트 앱을 삭제한다. -->

Next.js의 `POST /api/answer`가 FastAPI의 `POST /answer`로 요청을 전달하는 로컬 연동 예시다. [요청, 모델 응답, 가상 근거 예시](../frontend/tests/fixtures/temporary-ai-contract.json)에 `TEMPORARY` 표시와 테스트 입력 두 건을 넣었다. 응답의 `temporary: true`로 실행 중에도 예시임을 확인할 수 있다.

| 위치 | 임시 필드와 동작 |
| --- | --- |
| Next.js → FastAPI | 기존 `text`, `district`, `businessDate`, `corpusVersion`에 `context.recentTurns`, `context.knownFields`를 더한다. 서버에서 `AI_INTERNAL_TOKEN`을 Bearer 토큰으로 전달한다. |
| FastAPI → Next.js | `outcome`과 `answerUnits`를 반환한다. `candidate`에는 AI2의 분류·추가 질문·개인 조회 필요 여부를 담는다. 인용 링크와 기준일은 가상 근거 자료에서 가져온다. |
| 근거 없음 | `200 no_evidence`, 빈 `answerUnits`, `needsPersonalLookup: true`를 반환하는 예시를 검증한다. 상담사 버튼과 Supabase 저장은 #6에서 연결한다. |
| 요청 거절 | 예시 목록에 없는 요청은 `422 temporary_fixture_only`, 인증 헤더 없이 FastAPI에 직접 보낸 요청은 `401 unauthorized`를 반환한다. |

## PowerShell에서 실행

프로젝트 루트에서 터미널 세 개를 열고 아래 블록을 각각 실행한다. Python 3.13, uv, Node.js와 `frontend`의 npm 의존성이 필요하다.

```powershell
cd backend
$env:AI_INTERNAL_TOKEN='temporary-local-only'
$env:BRIDGE_TEMPORARY_LIVE_MODEL='0'
uv run --no-project --python 3.13 --with-requirements requirements.txt python -B -m uvicorn temporary_answer_app:app --app-dir tests --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
$env:BRIDGE_TEMPORARY_AI_URL='http://127.0.0.1:8000'
$env:AI_INTERNAL_TOKEN='temporary-local-only'
node node_modules/next/dist/bin/next dev tests/temporary-ai-app --hostname 127.0.0.1 --port 3001
```

```powershell
cd frontend
node tests/temporary-ai-smoke.mjs
```

기본 실행은 예시 모델 응답을 AI2 코드에 주입한다. 실제 모델 호출은 첫 터미널에서 `OPENAI_MODEL`과 모델 키를 로컬 환경 변수로 설정한 뒤 `BRIDGE_TEMPORARY_LIVE_MODEL='1'`로 실행한다. FastAPI가 예시와 일치하는 두 요청만 모델에 전달한다.
