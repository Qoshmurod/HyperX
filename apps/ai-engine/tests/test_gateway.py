from app.decisions.drafter import draft
from app.model_gateway.gateway import Gateway, get_gateway
from app.reports.commentary import commentary
from app.security.redaction import redact


class FakeClient:
    def __init__(self, healthy=True, fail=False):
        self._healthy, self.fail, self.calls = healthy, fail, []

    def healthy(self, model=None):
        return self._healthy

    def chat(self, model, system, user, temperature=0.2):
        from app.llm.clients import Completion

        self.calls.append(user)
        if self.fail:
            raise RuntimeError("boom")
        return Completion(text=f"answer from {model}", prompt_tokens=10, output_tokens=5)


def _gw(monkeypatch, local_ok=True, central_ok=True):
    monkeypatch.setenv("OLLAMA_URL", "http://ollama")
    monkeypatch.setenv("CENTRAL_LLM_URL", "http://central")
    from app.config import reset_settings

    reset_settings()
    gw = Gateway()
    local, central = FakeClient(local_ok), FakeClient(central_ok)
    gw.clients = {gw.models[0].name: local, gw.models[1].name: central}
    return gw, local, central


def test_no_models_falls_back_to_template() -> None:
    r = get_gateway().generate("chat", "internal", "s", "u")
    assert r.text is None and r.meta["model_name"] == "govmind-rules"


def test_prefers_local(monkeypatch) -> None:
    gw, local, central = _gw(monkeypatch)
    r = gw.generate("chat", "internal", "s", "u")
    assert r.meta["runtime"] == "local" and local.calls and not central.calls


def test_confidential_never_goes_to_central_when_local_down(monkeypatch) -> None:
    gw, local, central = _gw(monkeypatch, local_ok=False)
    r = gw.generate("chat", "confidential", "s", "u")
    assert r.text is None and not central.calls


def test_internal_goes_to_central_with_redaction(monkeypatch) -> None:
    gw, local, central = _gw(monkeypatch, local_ok=False)
    r = gw.generate("chat", "internal", "s", "Murojaatchi: AA1234567, tel +998 90 123 45 67, ali@example.uz, 12345678901234")
    assert r.meta["runtime"] == "central"
    sent = central.calls[0]
    assert "AA1234567" not in sent and "ali@example.uz" not in sent and "12345678901234" not in sent and "123 45 67" not in sent


def test_model_failure_falls_back(monkeypatch) -> None:
    gw, local, _ = _gw(monkeypatch)
    local.fail = True
    assert gw.generate("chat", "internal", "s", "u").text is None


def test_redaction() -> None:
    assert redact("Pasport AB 1234567") == "Pasport [PASSPORT]"


def test_decision_draft_has_options_with_impact() -> None:
    ev = [
        {
            "query_code": "tasks.late_by_org",
            "rows": [{"organization_name": "A", "total": 10, "late": 5, "late_pct": 50, "prev_late_pct": 20}],
        }
    ]
    d = draft("Kechikishlar ko'p", ev, "internal", "en")
    assert len(d["options"]) == 3
    assert d["options"][0]["impact_estimate"] == {"metric": "late_pct", "from": 50.0, "to": 35.0, "effect_pct": 30}
    assert any("A" in c for c in d["causes"])


def test_commentary_languages() -> None:
    rep = {
        "organization_name": "Birinchi tuman",
        "period": {"from": "2026-07-01", "to": "2026-09-30"},
        "summary": {"total": 10, "done": 7, "overdue": 2, "on_time_pct": 80},
        "late_by_organization": [],
        "kpi_behind_plan": [],
    }
    assert "Биринчи туман" in commentary(rep, "internal", "uz-Cyrl")["text"]
    assert "On" in commentary(rep, "internal", "en")["text"] or "on-time" in commentary(rep, "internal", "en")["text"]
