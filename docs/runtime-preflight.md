# AI2 모델 사전시험

2026-11-21 로컬 Windows Python 3.12에서 SSAFY GMS Responses API의 `gpt-4.1-mini`를 시험했다. 모델 ID는 호출에 사용한 별칭이다. 요청은 두 건 모두 가상 발화 또는 가상 근거만 사용했다.

| 검증 | 결과 |
| --- | --- |
| 한국어 문의 해석 | 마포구 거주지와 용산구 냉장고 배출지를 별도 필드로 반환하고 스키마 검증 통과. 3,993ms |
| 한국어 근거 답변 | 가상 신청 창구 안내를 반환하고 제공한 청크 ID, 검증 항목 키 및 인용과의 일치 확인. 3,834ms |
| 형식 및 업무 규칙 오류 | 필수 필드가 없는 JSON을 로컬 검증에서 거절. 최초 실모델 답변이 불필요한 되묻기를 제안해 거절됐으며 프롬프트 보완 후 위 표본 통과 |

두 건의 단일 측정이다. 실제 민원 답변이나 지연 목표 달성은 배포 환경의 별도 평가로 확인한다.

## 재실행

저장소의 `backend/`에서 기존 `GMS_KEY` 또는 `OPENAI_API_KEY` 환경변수와 사용할 모델 ID를 지정한다. 두 키가 설정된 경우 OpenAI가 우선한다.

```powershell
$env:OPENAI_MODEL = 'gpt-4.1-mini'
uv run --with-requirements requirements.txt python -B preflight_model.py
uv run --with-requirements requirements.txt python -B -m unittest discover -s tests -v
```

## 다음 통합에서 확인할 것

- T008·T015·T020·T022·T040의 선작업은 `backend/model_client.py`와 `backend/dialogue.py`에 둔다. 10초 예산, 일시 오류의 1회 재시도, 취소 전달, 구조화 JSON과 인용 검증, 목적별 위치 키, 원문 기반 요약 초안을 단위 시험한다.
- 모델은 내부 후보만 생성한다. 서버가 넘겨준 정확한 근거 발췌를 답변과 창구용으로 각각 확인한다. 문장이 근거에서 실제로 뒷받침되는지와 관할·유효성은 검색 통합에서 검사한다. 원문 기반 요약의 확인·버전과 상담 상태 전이는 Next.js가 소유한다.
- [추론 계약 이슈 #4](https://github.com/Alexjung0115/120_Bridge/issues/4)에서 문의 문맥과 후보 스키마를 맞춘 뒤, 기존 FastAPI `/answer`와 Next.js를 같은 샘플로 검증한다. 현재 `/answer`는 준비 브랜치의 `ai_unavailable` 경로를 유지한다.
- [근거 적재 이슈 #5](https://github.com/Alexjung0115/120_Bridge/issues/5)의 청크 검증이 완료되면 [독립 15문항](../frontend/tests/fixtures/generalization.json)의 근거 ID를 확정한다. [이관 정책 11문항](../frontend/tests/fixtures/policy-cases.json)과 함께 실제 API에서 평가한다. 독립 문항은 검색 임계값 조정에 사용하지 않는다.
