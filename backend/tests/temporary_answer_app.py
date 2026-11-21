# TEMPORARY (#4/#5): Local contract rehearsal for synthetic requests only. Remove on real integration.
import json
import os
from pathlib import Path
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import Field

from dialogue import CandidateModel, DialogueCandidate, EvidenceExcerpt, KnownField, propose
from main import AnswerRequest, AnswerResult, AnswerUnit, Citation, require_internal_token
from model_client import InvalidModelOutput, ModelUnavailable, ResponsesClient


class TemporaryTurn(CandidateModel):
    role: Literal["citizen", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class TemporaryContext(CandidateModel):
    recentTurns: list[TemporaryTurn] = Field(max_length=10)
    knownFields: list[KnownField] = Field(max_length=20)


class TemporaryAnswerRequest(AnswerRequest):
    context: TemporaryContext


class TemporaryAnswerResult(AnswerResult):
    temporary: Literal[True] = True
    candidate: DialogueCandidate


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
async def answer(request: TemporaryAnswerRequest) -> TemporaryAnswerResult:
    payload = request.model_dump(mode="json")
    case = next((row for row in cases if row["request"] == payload), None)
    if case is None:
        raise HTTPException(status_code=422, detail={"code": "temporary_fixture_only"})

    evidence = [EvidenceExcerpt.model_validate(row["excerpt"]) for row in case["evidence"]]
    sources = {
        (row["excerpt"]["chunkId"], row["excerpt"]["claimKey"]): {
            "sourceUrl": row["sourceUrl"], "basisDate": row["basisDate"],
        }
        for row in case["evidence"]
    }
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
                model, text=request.text, context=request.context.model_dump(), evidence=evidence,
            )
    except TimeoutError:
        raise HTTPException(status_code=504, detail={"code": "ai_timeout"}) from None
    except (ModelUnavailable, InvalidModelOutput):
        raise HTTPException(status_code=503, detail={"code": "ai_unavailable"}) from None

    units = [
        AnswerUnit(text=unit.text, citations=[
            Citation(**ref.model_dump(), **sources[(ref.chunkId, ref.claimKey)])
            for ref in unit.citations
        ])
        for unit in candidate.answerUnits
    ]
    return TemporaryAnswerResult(
        outcome="answer" if units else "no_evidence", answerUnits=units, candidate=candidate,
    )
