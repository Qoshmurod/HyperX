"""AI Gateway: barcha LLM chaqiruvlari shu yerdan o'tadi.

- model maxfiylik darajasi va sog'lig'iga qarab tanlanadi (router.select_model);
- maxfiy ma'lumot hech qachon markaziy modelga yuborilmaydi;
- markaziy modelga ketadigan matndan shaxsiy ma'lumotlar niqoblanadi;
- hech bir model mos kelmasa yoki ishlamasa — None qaytadi va chaqiruvchi
  deterministik (shablon) javobga o'tadi; bu holat ham model sifatida qayd etiladi.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from prometheus_client import Counter

from app.config import get_settings
from app.llm.clients import OllamaClient, OpenAICompatibleClient
from app.security.redaction import redact

from .registry import Classification, ModelSpec
from .router import NoEligibleModelError, select_model

log = logging.getLogger("govmind.gateway")

LLM_CALLS = Counter("govmind_ai_llm_calls_total", "LLM calls", ["model", "runtime", "outcome"])
LLM_TOKENS = Counter("govmind_ai_llm_tokens_total", "LLM tokens", ["model", "kind"])

TEMPLATE_META = {"model_name": "govmind-rules", "model_version": "1", "runtime": "local"}


@dataclass
class GenResult:
    text: str | None
    meta: dict = field(default_factory=lambda: dict(TEMPLATE_META))


class Gateway:
    def __init__(self) -> None:
        s = get_settings()
        self.models: list[ModelSpec] = []
        self.clients: dict[str, OllamaClient | OpenAICompatibleClient] = {}
        if s.ollama_url:
            spec = ModelSpec(
                name=s.local_chat_model,
                version="ollama",
                runtime="local",
                context_tokens=32_768,
                min_ram_gb=8,
                max_classification=Classification.parse(s.local_model_max_classification),
                tasks=frozenset({"chat", "summarize", "analyze", "report", "decision"}),
            )
            self.models.append(spec)
            self.clients[spec.name] = OllamaClient(s.ollama_url, s.llm_timeout_s)
        if s.central_llm_url:
            spec = ModelSpec(
                name=s.central_llm_model,
                version="vllm",
                runtime="central",
                context_tokens=128_000,
                min_ram_gb=80,
                max_classification=Classification.INTERNAL,
                tasks=frozenset({"chat", "summarize", "analyze", "report", "decision"}),
            )
            self.models.append(spec)
            self.clients[spec.name] = OpenAICompatibleClient(s.central_llm_url, s.central_llm_api_key, s.llm_timeout_s)
        self.disabled = set(s.disabled_models)

    def _healthy(self, m: ModelSpec) -> bool:
        return m.name not in self.disabled and self.clients[m.name].healthy(m.name if m.runtime == "local" else None)

    def generate(self, task: str, classification: str, system: str, user: str) -> GenResult:
        level = Classification.parse(classification)
        try:
            model = select_model(self.models, task, level, self._healthy)
        except NoEligibleModelError:
            return GenResult(text=None)
        prompt = redact(user) if model.runtime == "central" else user
        try:
            out = self.clients[model.name].chat(model.name, system, prompt)
        except Exception as exc:  # noqa: BLE001 — har qanday model xatosi shablon javobga olib keladi
            log.warning("model %s failed: %s", model.name, exc)
            LLM_CALLS.labels(model.name, model.runtime, "error").inc()
            return GenResult(text=None)
        LLM_CALLS.labels(model.name, model.runtime, "ok").inc()
        if out.prompt_tokens:
            LLM_TOKENS.labels(model.name, "prompt").inc(out.prompt_tokens)
        if out.output_tokens:
            LLM_TOKENS.labels(model.name, "output").inc(out.output_tokens)
        return GenResult(
            text=out.text or None,
            meta={
                "model_name": model.name,
                "model_version": model.version,
                "runtime": model.runtime,
                "prompt_tokens": out.prompt_tokens,
                "output_tokens": out.output_tokens,
            },
        )

    def describe(self) -> list[dict]:
        out = []
        for m in self.models:
            out.append(
                {
                    "name": m.name,
                    "version": m.version,
                    "runtime": m.runtime,
                    "contextTokens": m.context_tokens,
                    "minRamGb": m.min_ram_gb,
                    "maxClassification": m.max_classification.name.lower(),
                    "tasks": sorted(m.tasks),
                    "healthy": self._healthy(m),
                }
            )
        out.append(
            {
                "name": TEMPLATE_META["model_name"],
                "version": "1",
                "runtime": "local",
                "maxClassification": "secret",
                "tasks": ["*"],
                "healthy": True,
                "note": "deterministic fallback, no LLM",
            }
        )
        return out


_gateway: Gateway | None = None


def get_gateway() -> Gateway:
    global _gateway
    if _gateway is None:
        _gateway = Gateway()
    return _gateway


def reset_gateway() -> None:
    global _gateway
    _gateway = None
