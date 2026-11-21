import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import AnswerResult, answer_provider, app


PAYLOAD = {
    "text": "마포구 냉장고는 어디에 신청해요?",
    "district": "마포구",
    "businessDate": "2026-11-21",
    "corpusVersion": "test",
}
AUTH = {"Authorization": "Bearer only-for-tests"}


class AnswerTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {"AI_INTERNAL_TOKEN": "only-for-tests"}))
        self.enterContext(patch.dict(app.dependency_overrides))
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_health_and_fail_closed(self):
        self.assertEqual(self.client.get("/health").json(), {"ok": True})
        self.assertEqual(self.client.post("/answer", json=PAYLOAD).status_code, 401)
        response = self.client.post("/answer", json=PAYLOAD, headers=AUTH)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "ai_unavailable")

    def test_unconfigured_token_disables_answer(self):
        with patch.dict(os.environ, {"AI_INTERNAL_TOKEN": ""}):
            self.assertEqual(self.client.post("/answer", json=PAYLOAD, headers=AUTH).status_code, 401)

    def test_normal_answer_returns_citation(self):
        result = {
            "outcome": "answer",
            "answerUnits": [{
                "text": "공식 자료 확인 결과입니다.",
                "citations": [{
                    "chunkId": "test/section-1",
                    "claimKey": "test.checked-fact",
                    "quote": "인용문 예시",
                    "sourceUrl": "https://example.com/source",
                    "basisDate": "2026-11-21",
                }],
            }],
        }
        app.dependency_overrides[answer_provider] = lambda: lambda _: AnswerResult(**result)
        response = self.client.post("/answer", json=PAYLOAD, headers=AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)

    def test_no_evidence_has_no_answer_units(self):
        app.dependency_overrides[answer_provider] = lambda: lambda _: AnswerResult(outcome="no_evidence")
        response = self.client.post("/answer", json=PAYLOAD, headers=AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"outcome": "no_evidence", "answerUnits": []})

    def test_timeout_has_distinct_error(self):
        def timeout(_):
            raise TimeoutError("test upstream timeout")

        app.dependency_overrides[answer_provider] = lambda: timeout
        response = self.client.post("/answer", json=PAYLOAD, headers=AUTH)
        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json(), {"detail": {"code": "ai_timeout"}})
