import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings, get_settings
from app.main import app


@pytest.fixture
def client():
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        engine_api_token=SecretStr("engine-secret"),
        whatsapp_verify_token=SecretStr("verify-secret"),
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_scan_rejects_missing_token(client):
    assert client.post("/jobs/scan").status_code == 401


def test_scan_accepts_valid_token(client):
    response = client.post("/jobs/scan", headers={"Authorization": "Bearer engine-secret"})
    assert response.status_code == 202


def test_whatsapp_verification_echoes_challenge(client):
    params = {"hub.mode": "subscribe", "hub.verify_token": "verify-secret", "hub.challenge": "42"}
    response = client.get("/webhooks/whatsapp", params=params)
    assert response.status_code == 200
    assert response.text == "42"


def test_whatsapp_verification_rejects_wrong_token(client):
    params = {"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42"}
    assert client.get("/webhooks/whatsapp", params=params).status_code == 403
