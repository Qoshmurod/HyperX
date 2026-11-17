"""Embedding: Ollama embedding modeli yoki (offline/zaxira) feature-hashing vektorlari."""

from __future__ import annotations

import hashlib
import math
import re

from app.config import get_settings
from app.llm.clients import OllamaClient
from app.nlp.transliteration import normalize


class HashingEmbedder:
    """Tashqi modelsiz ishlaydigan leksik embedding (so'z va 4-gramlar). Internet/GPU talab qilmaydi."""

    name = "hashing-v1"
    dim = 768

    def _features(self, text: str) -> list[str]:
        t = normalize(text).lower()
        words = re.findall(r"[\w']+", t)
        feats = [f"w:{w}" for w in words]
        for w in words:
            p = f"#{w}#"
            feats += [f"g:{p[i : i + 4]}" for i in range(max(1, len(p) - 3))]
        return feats

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            v = [0.0] * self.dim
            for f in self._features(text):
                h = int.from_bytes(hashlib.blake2b(f.encode(), digest_size=8).digest(), "little")
                v[h % self.dim] += 1.0 if (h >> 63) & 1 else -1.0
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out


class OllamaEmbedder:
    def __init__(self, url: str, model: str):
        self.client = OllamaClient(url)
        self.model = model
        self.name = f"ollama-{model}".replace(":", "-").replace("/", "-")
        self.dim = len(self.client.embed(model, ["probe"])[0])

    def embed(self, texts: list[str]) -> list[list[float]]:
        return self.client.embed(self.model, [normalize(t) for t in texts])


_embedder = None


def get_embedder():
    global _embedder
    if _embedder is None:
        s = get_settings()
        if s.ollama_url and s.embedding_model:
            try:
                _embedder = OllamaEmbedder(s.ollama_url, s.embedding_model)
            except Exception:  # noqa: BLE001 — model yo'q bo'lsa zaxira embedderga o'tiladi
                _embedder = HashingEmbedder()
        else:
            _embedder = HashingEmbedder()
    return _embedder


def reset_embedder() -> None:
    global _embedder
    _embedder = None
