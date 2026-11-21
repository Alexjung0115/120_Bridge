import asyncio
import os

import httpx
from pydantic import BaseModel


OPENAI_RESPONSES = "https://api.openai.com/v1/responses"
GMS_RESPONSES = "https://gms.ssafy.io/gmsapi/api.openai.com/v1/responses"
TRANSIENT_STATUS_CODES = {502, 503, 504}


class ModelUnavailable(RuntimeError):
    pass


class InvalidModelOutput(RuntimeError):
    pass


class ResponsesClient:
    def __init__(
        self, client: httpx.AsyncClient, *, endpoint: str, api_key: str, model: str,
        timeout: float = 10,
    ):
        self.client = client
        self.endpoint = endpoint
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    @classmethod
    def from_environment(cls, client: httpx.AsyncClient) -> "ResponsesClient":
        model = os.environ.get("OPENAI_MODEL")
        api_key = os.environ.get("OPENAI_API_KEY")
        endpoint = OPENAI_RESPONSES
        if not api_key:
            api_key = os.environ.get("GMS_KEY")
            endpoint = GMS_RESPONSES
        if not model or not api_key:
            raise ModelUnavailable("OPENAI_MODEL and a model API key are required")
        return cls(client, endpoint=endpoint, api_key=api_key, model=model)

    async def structured[T: BaseModel](
        self, *, instructions: str, input_text: str, result_type: type[T],
    ) -> T:
        payload = {
            "model": self.model,
            "store": False,
            "instructions": instructions,
            "input": input_text,
            "text": {"format": {
                "type": "json_schema",
                "name": result_type.__name__,
                "strict": True,
                "schema": result_type.model_json_schema(),
            }},
        }
        async with asyncio.timeout(self.timeout):
            response = await self._send(payload)
        try:
            return result_type.model_validate_json(self._output_text(response.json()))
        except (ValueError, TypeError, KeyError, AttributeError):
            raise InvalidModelOutput("Model output failed validation") from None

    async def _send(self, payload: dict) -> httpx.Response:
        for attempt in range(2):
            try:
                response = await self.client.post(
                    self.endpoint,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                    timeout=self.timeout,
                    follow_redirects=False,
                )
            except httpx.TimeoutException:
                raise TimeoutError("Model request timed out") from None
            except httpx.TransportError:
                if attempt == 0:
                    continue
                raise ModelUnavailable("Model transport is unavailable") from None

            if response.is_success:
                return response
            if attempt == 0 and response.status_code in TRANSIENT_STATUS_CODES:
                continue
            raise ModelUnavailable(f"Model request returned HTTP {response.status_code}")
        raise ModelUnavailable("Model request failed")

    @staticmethod
    def _output_text(body: dict) -> str:
        if body.get("status") != "completed":
            raise InvalidModelOutput("Model response did not complete")
        content = [
            part
            for item in body["output"] if item["type"] == "message"
            for part in item["content"]
        ]
        if len(content) != 1 or content[0]["type"] != "output_text":
            raise InvalidModelOutput("Model response did not contain a structured answer")
        return content[0]["text"]
