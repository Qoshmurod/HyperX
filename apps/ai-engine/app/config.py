from __future__ import annotations

import os
from dataclasses import dataclass, field


def _list(name: str, default: str = "") -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    internal_token: str = field(default_factory=lambda: os.getenv("AI_ENGINE_TOKEN", ""))
    node_role: str = field(default_factory=lambda: os.getenv("GOVMIND_NODE_ROLE", "local"))
    # Lokal LLM (Ollama)
    ollama_url: str | None = field(default_factory=lambda: os.getenv("OLLAMA_URL") or None)
    local_chat_model: str = field(default_factory=lambda: os.getenv("LOCAL_CHAT_MODEL", "qwen2.5:7b-instruct"))
    local_model_max_classification: str = field(
        default_factory=lambda: os.getenv("LOCAL_MODEL_MAX_CLASSIFICATION", "confidential")
    )
    embedding_model: str | None = field(default_factory=lambda: os.getenv("EMBEDDING_MODEL") or None)
    # Markaziy LLM (vLLM, OpenAI-mos API) — faqat ruxsat etilgan darajadagi ma'lumot uchun
    central_llm_url: str | None = field(default_factory=lambda: os.getenv("CENTRAL_LLM_URL") or None)
    central_llm_model: str = field(default_factory=lambda: os.getenv("CENTRAL_LLM_MODEL", "central-large"))
    central_llm_api_key: str | None = field(default_factory=lambda: os.getenv("CENTRAL_LLM_API_KEY") or None)
    # Vektor baza: QDRANT_URL yoki lokal fayl (offline), yoki ":memory:" (test)
    qdrant_url: str | None = field(default_factory=lambda: os.getenv("QDRANT_URL") or None)
    qdrant_path: str = field(default_factory=lambda: os.getenv("QDRANT_PATH", ":memory:"))
    llm_timeout_s: float = field(default_factory=lambda: float(os.getenv("LLM_TIMEOUT_S", "120")))
    disabled_models: list[str] = field(default_factory=lambda: _list("DISABLED_MODELS"))


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None
