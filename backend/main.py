import asyncio
import hmac
import os
from collections.abc import Callable
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

import httpx
from dialogue import CandidateModel, DialogueCandidate, KnownField, interpret, propose
from model_client import ModelUnavailable, ResponsesClient


app = FastAPI()
bearer = HTTPBearer(auto_error=False)


class RecentTurn(CandidateModel):
    role: Literal["citizen", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=2000)
    recentTurns: list[RecentTurn] = Field(max_length=10)
    knownFields: list[KnownField] = Field(max_length=20)


def require_internal_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)],
) -> None:
    token = os.environ.get("AI_INTERNAL_TOKEN")
    if not token or not credentials or not hmac.compare_digest(
        token.encode(), credentials.credentials.encode()
    ):
        raise HTTPException(status_code=401, detail={"code": "unauthorized"})


async def answer_provider() -> Callable[[AnswerRequest], DialogueCandidate]:
    try:
        async with httpx.AsyncClient() as http:
            client = ResponsesClient.from_environment(http)
    except ModelUnavailable:
        raise HTTPException(status_code=503, detail={"code": "ai_unavailable"})

    async def _provider(req: AnswerRequest) -> DialogueCandidate:
        async with httpx.AsyncClient() as http:
            live_client = ResponsesClient.from_environment(http)
            context = {
                "recentTurns": [t.model_dump() for t in req.recentTurns],
                "knownFields": [f.model_dump() for f in req.knownFields],
            }
            candidate = await propose(live_client, text=req.text, context=context, evidence=[])
            return candidate

    return _provider


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/answer", dependencies=[Depends(require_internal_token)])
async def answer(
    request: AnswerRequest,
    provider: Annotated[Callable[[AnswerRequest], DialogueCandidate], Depends(answer_provider)],
) -> DialogueCandidate:
    try:
        res = provider(request)
        if asyncio.iscoroutine(res):
            return await res
        return res
    except TimeoutError:
        raise HTTPException(status_code=504, detail={"code": "ai_timeout"}) from None
