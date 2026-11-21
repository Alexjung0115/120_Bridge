# TEMPORARY (#4/#5): Local contract rehearsal for synthetic requests only. Remove on real integration.
import json
import os
from pathlib import Path
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException
from dialogue import DialogueCandidate, EvidenceExcerpt, propose
from main import AnswerRequest, require_internal_token
from model_client import InvalidModelOutput, ModelUnavailable, ResponsesClient


class TemporaryAnswerResult(DialogueCandidate):
    temporary: Literal[True] = True


fixture_path = Path(__file__).resolve().parents[2] / "frontend/tests/fixtures/temporary-ai-contract.json"
cases = json.loads(fixture_path.read_text(encoding="utf-8"))["cases"]
app = FastAPI()


def fixture_transport(candidate: dict) -> httpx.MockTransport:
    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "status": "completed",
            "output": [{"type": "message", "content": [
                {"type": "output_text", "text": json.dumps(candidate)},
            ]}],
        })

    return httpx.MockTransport(respond)


@app.post("/answer", dependencies=[Depends(require_internal_token)])
async def answer(request: AnswerRequest) -> TemporaryAnswerResult:
    payload = request.model_dump(mode="json")
    case = next((row for row in cases if row["request"] == payload), None)
    if case is None:
        raise HTTPException(status_code=422, detail={"code": "temporary_fixture_only"})

    evidence = [EvidenceExcerpt.model_validate(row["excerpt"]) for row in case["evidence"]]
    live = os.environ.get("BRIDGE_TEMPORARY_LIVE_MODEL") == "1"
    transport = None if live else fixture_transport(case["sampleCandidate"])
    try:
        async with httpx.AsyncClient(transport=transport) as http:
            model = (
                ResponsesClient.from_environment(http) if live else
                ResponsesClient(http, endpoint="https://example.invalid/responses",
                                api_key="temporary", model="temporary")
            )
            candidate = await propose(
                model, text=request.text, context={
                    "recentTurns": [turn.model_dump() for turn in request.recentTurns],
                    "knownFields": [field.model_dump() for field in request.knownFields],
                }, evidence=evidence,
            )
    except TimeoutError:
        raise HTTPException(status_code=504, detail={"code": "ai_timeout"}) from None
    except (ModelUnavailable, InvalidModelOutput):
        raise HTTPException(status_code=503, detail={"code": "ai_unavailable"}) from None

    return TemporaryAnswerResult(**candidate.model_dump())
