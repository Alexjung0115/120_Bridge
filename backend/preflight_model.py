import asyncio
import json
from time import perf_counter

import httpx
from pydantic import ValidationError

from dialogue import EvidenceExcerpt, IntakeCandidate, interpret, propose
from model_client import InvalidModelOutput, ModelUnavailable, ResponsesClient


async def main() -> None:
    async with httpx.AsyncClient() as http:
        client = ResponsesClient.from_environment(http)

        started = perf_counter()
        intake = await interpret(
            client, text="마포구에 살지만 냉장고는 용산구에 있는 집에 두고 왔어요. 어디서 버려요?",
            context={},
        )
        intake_ms = round((perf_counter() - started) * 1000)
        if (
            not intake.issues
            or intake.issues[0].district_for("disposal") != "용산구"
            or intake.issues[0].district_for("residence") != "마포구"
        ):
            raise InvalidModelOutput("Purpose-specific location preflight failed")

        evidence = EvidenceExcerpt(
            chunkId="preflight/document",
            claimKey="preflight.application",
            quote="가상의 예시 사업은 예시 접수 창구에서 신청합니다.",
            answerEligible=True,
            routingEligible=True,
        )
        started = perf_counter()
        answer = await propose(
            client, text="가상의 예시 사업은 어디서 신청하나요?", context={}, evidence=[evidence],
        )
        answer_ms = round((perf_counter() - started) * 1000)
        if not answer.answerUnits or not any("예시 접수 창구" in unit.text for unit in answer.answerUnits):
            raise InvalidModelOutput("Korean grounded answer preflight failed")
        try:
            IntakeCandidate.model_validate_json('{"intent":"잘못된 상태"}')
        except ValidationError:
            print(json.dumps({
                "model": client.model,
                "structuredKorean": True,
                "malformedRejected": True,
                "intakeMs": intake_ms,
                "answerMs": answer_ms,
            }))
        else:
            raise InvalidModelOutput("Malformed JSON was accepted")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (ModelUnavailable, InvalidModelOutput, TimeoutError) as exc:
        raise SystemExit(str(exc)) from None
