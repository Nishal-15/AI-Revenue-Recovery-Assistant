import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, SecretStr

from app.ai.enquiries import EnquiryClassification, classify_enquiry
from app.ai.llm import AiUnavailableError
from app.config import Settings, get_settings
from app.main import app, get_llm

AUTH = {"Authorization": "Bearer engine-secret"}

ALIGNERS = EnquiryClassification(
    interest="aligners", urgency="routine", language="en", wants_booking=False, summary="Asks aligner price"
)


class FakeLlm:
    def __init__(self, result: BaseModel | Exception) -> None:
        self.result = result
        self.calls: list[dict[str, object]] = []

    async def generate(self, *, system, prompt, schema):
        self.calls.append({"system": system, "prompt": prompt, "schema": schema})
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def client():
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, engine_api_token=SecretStr("engine-secret")
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


async def test_classify_enquiry_wraps_message_and_requests_schema():
    llm = FakeLlm(ALIGNERS)
    result = await classify_enquiry(llm, "  How much are clear aligners?  ")
    assert result == ALIGNERS
    call = llm.calls[0]
    assert call["schema"] is EnquiryClassification
    assert "<message>\nHow much are clear aligners?\n</message>" in call["prompt"]
    assert "Never give medical advice" in call["system"]


def test_endpoint_returns_classification(client):
    app.dependency_overrides[get_llm] = lambda: FakeLlm(ALIGNERS)
    response = client.post("/ai/classify-enquiry", json={"message": "aligners price?"}, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["interest"] == "aligners"


def test_endpoint_maps_provider_failure_to_502(client):
    app.dependency_overrides[get_llm] = lambda: FakeLlm(AiUnavailableError("quota exceeded"))
    response = client.post("/ai/classify-enquiry", json={"message": "hi"}, headers=AUTH)
    assert response.status_code == 502


def test_endpoint_without_api_key_is_503(client):
    response = client.post("/ai/classify-enquiry", json={"message": "hi"}, headers=AUTH)
    assert response.status_code == 503


def test_endpoint_requires_engine_token(client):
    response = client.post("/ai/classify-enquiry", json={"message": "hi"})
    assert response.status_code == 401
