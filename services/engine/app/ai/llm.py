"""The one place the engine talks to an LLM provider (Google Gemini).

Everything else depends on the small `StructuredLlm` protocol, so tests use a fake
and the provider can change without touching the recovery logic.
"""

from typing import Protocol

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError


class AiUnavailableError(Exception):
    """The model could not be reached or returned something unusable."""


class StructuredLlm(Protocol):
    async def generate[T: BaseModel](self, *, system: str, prompt: str, schema: type[T]) -> T: ...


class GeminiLlm:
    def __init__(self, *, api_key: str, model: str) -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def generate[T: BaseModel](self, *, system: str, prompt: str, schema: type[T]) -> T:
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.2,
        )
        try:
            response = await self._client.aio.models.generate_content(
                model=self._model, contents=prompt, config=config
            )
        except genai_errors.APIError as error:
            raise AiUnavailableError(f"Gemini request failed: {error}") from error

        if isinstance(response.parsed, schema):
            return response.parsed
        try:
            return schema.model_validate_json(response.text or "")
        except ValidationError as error:
            raise AiUnavailableError("Gemini returned output that does not match the schema") from error
