from fastapi.testclient import TestClient

from app.main import app


def test_health_is_public() -> None:
    assert TestClient(app).get("/health").json()["status"] == "ok"


def test_internal_endpoints_require_token() -> None:
    c = TestClient(app)
    assert c.post("/internal/v1/nlp/normalize", json={"text": "x"}).status_code == 401
    assert c.post("/internal/v1/nlp/normalize", json={"text": "x"}, headers={"X-Internal-Token": "wrong"}).status_code == 401


def test_normalize_endpoint(client) -> None:
    res = client.post("/internal/v1/nlp/normalize", json={"text": "Туман ҳисоботи"})
    assert res.json() == {"text": "Tuman hisoboti"}


def test_models_lists_fallback(client) -> None:
    names = {m["name"] for m in client.get("/internal/v1/models").json()}
    assert "govmind-rules" in names


def test_plan_and_explain_roundtrip(client) -> None:
    p = client.post(
        "/internal/v1/analyst/plan", json={"question": "Oxirgi chorakda qaysi tashkilotlarda topshiriqlar kechikkan?"}
    ).json()
    assert p["query_code"] == "tasks.late_by_org"
    rows = [{"organization_name": "A tuman", "total": 10, "late": 4, "late_pct": 40, "prev_late": 2, "prev_late_pct": 20}]
    e = client.post(
        "/internal/v1/analyst/explain",
        json={
            "question": "q",
            "query_code": p["query_code"],
            "rows": rows,
            "classification": "internal",
            "lang": "ru",
            "params": p["params"],
        },
    ).json()
    assert "A tuman" in e["answer"] and "ухудшение" in e["answer"]
    assert e["model_name"] == "govmind-rules"
