# FastAPI 선작업

Next.js가 상담 상태와 상담사 대기열을 관리한다. FastAPI는 화면과 분리된 추론 API를 제공한다. 현재 버전은 공개 헬스 체크와 서버 간 답변 계약을 제공한다. 실제 검색·모델 연결 전에는 내부 요청에 `ai_unavailable`을 반환한다.

## 로컬 검증

저장소 루트에서 실행한다. Python 3.13과 uv를 사용한다.

```powershell
python -B scripts/prepare_rag.py
python -B -m unittest discover -s tests -v
cd backend
uv run --with-requirements requirements.txt python -B -m unittest discover -s tests -v
```

자료 파일은 저장소 루트에서 `python -B scripts/prepare_rag.py --output corpus-import.jsonl`로 만들 수 있다. 이미 있는 파일은 덮어쓰지 않는다. 이 파일은 Supabase 적재의 입력이다. 현재 자료 432건·2,044개 청크에서 과거 원문 확인 이력은 보존하고, 항목별 검증을 거치지 않은 청크는 답변 후보에서 제외한다.

## Next.js에 전달할 답변 계약

- `GET /health`는 HTTP 200과 `{"ok":true}`를 반환한다. Vercel 경로는 `/api/ai/health`다.
- Next.js 서버의 `POST /answer`는 `Authorization: Bearer <AI_INTERNAL_TOKEN>`을 요구한다. 요청 JSON은 `text`, `businessDate`(YYYY-MM-DD), `corpusVersion`, 선택 필드 `district`다. `district`는 현재 문의에 적용되는 구다. 배출지나 신고 발생지를 거주지로 덮어쓰지 않는다.

| 응답 | Next.js의 처리 |
| --- | --- |
| HTTP 200 · `outcome: "answer"` | `answerUnits`에서 본문과 출처를 읽는다. 각 인용에는 청크 ID, 검증 항목 키, 인용문, URL, 기준일이 포함된다. |
| HTTP 200 · `outcome: "no_evidence"` | `answerUnits`는 빈 배열이다. 저장된 시민 발화를 바탕으로 근거 부족 규칙을 적용한다. |
| HTTP 504 · `detail.code: "ai_timeout"` | 실패 사유를 기록하고 상담사 연결 경로를 제공한다. |
| HTTP 503 · `detail.code: "ai_unavailable"` | AI 사용 불가를 기록한다. 현재 선작업 버전의 정상적인 결과다. |
| HTTP 401 · `detail.code: "unauthorized"` | 서버 간 인증 설정을 확인한다. |

정상 응답과 타임아웃은 테스트에서 공급자를 교체해 실행한다. 실제 모델을 붙일 때는 검색 결과와 인용이 일치하는지 검증한 뒤 응답을 반환한다. 상담사 바로 연결은 Next.js와 Supabase의 별도 경로로 실행한다.

## Cloud Run 재배포

GCP 프로젝트에 인증된 Cloud Shell 또는 Google Cloud CLI에서 Git 저장소 루트 기준으로 실행한다. 기존 `bridge-api-demo` 서비스를 사용한다.

```bash
gcloud run deploy bridge-api-demo \
  --project=project-48911118-4cf5-4421-83a \
  --region=asia-northeast3 \
  --source=backend
```

새 리비전 확인 후 공개 [Cloud Run 헬스 체크](https://bridge-api-demo-129844172635.asia-northeast3.run.app/health)와 [Vercel 헬스 체크](https://120-bridge.vercel.app/api/ai/health)를 각각 호출한다. 실제 모델 연결 시 서버 간 토큰과 모델 키는 Cloud Run에 Secret Manager로 제공한다.
