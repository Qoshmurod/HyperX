"""LLM mijozlari: Ollama (lokal) va OpenAI-mos API (vLLM, markaziy)."""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx


@dataclass
class Completion:
    text: str
    prompt_tokens: int | None = None
    output_tokens: int | None = None


class OllamaClient:
    def __init__(self, base_url: str, timeout: float = 120.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._health: tuple[float, bool] | None = None

    def healthy(self, model: str | None = None) -> bool:
        now = time.monotonic()
        if self._health and now - self._health[0] < 30:
            return self._health[1]
        ok = False
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=3)
            if r.status_code == 200:
                names = {m.get("name") for m in r.json().get("models", [])}
                ok = model is None or model in names or f"{model}:latest" in names
        except httpx.HTTPError:
            ok = False
        self._health = (now, ok)
        return ok

    def chat(self, model: str, system: str, user: str, temperature: float = 0.2) -> Completion:
        r = httpx.post(
            f"{self.base_url}/api/chat",
            json={
                "model": model,
                "stream": False,
                "options": {"temperature": temperature},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
            timeout=self.timeout,
        )
        r.raise_for_status()
        data = r.json()
        return Completion(
            text=data.get("message", {}).get("content", "").strip(),
            prompt_tokens=data.get("prompt_eval_count"),
            output_tokens=data.get("eval_count"),
        )

    def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        r = httpx.post(f"{self.base_url}/api/embed", json={"model": model, "input": texts}, timeout=self.timeout)
        r.raise_for_status()
        return r.json()["embeddings"]


class OpenAICompatibleClient:
    def __init__(self, base_url: str, api_key: str | None, timeout: float = 120.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._health: tuple[float, bool] | None = None

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def healthy(self, model: str | None = None) -> bool:
        now = time.monotonic()
        if self._health and now - self._health[0] < 30:
            return self._health[1]
        try:
            ok = httpx.get(f"{self.base_url}/v1/models", headers=self._headers(), timeout=3).status_code == 200
        except httpx.HTTPError:
            ok = False
        self._health = (now, ok)
        return ok

    def chat(self, model: str, system: str, user: str, temperature: float = 0.2) -> Completion:
        r = httpx.post(
            f"{self.base_url}/v1/chat/completions",
            headers=self._headers(),
            json={
                "model": model,
                "temperature": temperature,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
            timeout=self.timeout,
        )
        r.raise_for_status()
        data = r.json()
        usage = data.get("usage") or {}
        return Completion(
            text=data["choices"][0]["message"]["content"].strip(),
            prompt_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
        )
