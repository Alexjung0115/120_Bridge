import hmac
import os
from collections.abc import Callable
from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator


app = FastAPI()
bearer = HTTPBearer(auto_error=False)


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=2000)
    district: str | None = Field(default=None, max_length=20)
    businessDate: date
    corpusVersion: str = Field(min_length=1, max_length=80)


class Citation(BaseModel):
    chunkId: str = Field(min_length=1)
    claimKey: str = Field(min_length=1)
    quote: str = Field(min_length=1)
    sourceUrl: str = Field(pattern=r"^https://")
    basisDate: date | None


class AnswerUnit(BaseModel):
    text: str = Field(min_length=1)
    citations: list[Citation] = Field(min_length=1)


class AnswerResult(BaseModel):
    outcome: Literal["answer", "no_evidence"]
    answerUnits: list[AnswerUnit] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_grounded_answer(self) -> "AnswerResult":
        if bool(self.answerUnits) != (self.outcome == "answer"):
            raise ValueError("Only an answer with citations may contain answer units")
        return self


def require_internal_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)],
) -> None:
    token = os.environ.get("AI_INTERNAL_TOKEN")
    if not token or not credentials or not hmac.compare_digest(
        token.encode(), credentials.credentials.encode()
    ):
        raise HTTPException(status_code=401, detail={"code": "unauthorized"})


def answer_provider() -> Callable[[AnswerRequest], AnswerResult]:
    # Until a real provider is wired, a request must not produce a synthetic answer.
    raise HTTPException(status_code=503, detail={"code": "ai_unavailable"})


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/answer", dependencies=[Depends(require_internal_token)])
def answer(
    request: AnswerRequest,
    provider: Annotated[Callable[[AnswerRequest], AnswerResult], Depends(answer_provider)],
) -> AnswerResult:
    try:
        return provider(request)
    except TimeoutError:
        raise HTTPException(status_code=504, detail={"code": "ai_timeout"}) from None
