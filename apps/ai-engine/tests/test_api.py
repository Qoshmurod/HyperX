from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json()["status"] == "ok"


def test_normalize_endpoint() -> None:
    res = client.post("/internal/v1/nlp/normalize", json={"text": "Туман ҳисоботи"})
    assert res.status_code == 200
    assert res.json() == {"text": "Tuman hisoboti"}


def test_models_endpoint_lists_registry() -> None:
    names = {m["name"] for m in client.get("/internal/v1/models").json()}
    assert "qwen2.5-7b-instruct" in names
