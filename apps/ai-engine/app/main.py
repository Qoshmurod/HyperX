from __future__ import annotations

import os

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.model_gateway.registry import DEFAULT_MODELS
from app.nlp.transliteration import normalize

app = FastAPI(title="GovMind AI Engine", version="0.1.0", docs_url="/internal/docs")


class NormalizeRequest(BaseModel):
    text: str = Field(max_length=100_000)


class NormalizeResponse(BaseModel):
    text: str


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "govmind-ai-engine",
        "nodeRole": os.getenv("GOVMIND_NODE_ROLE", "local"),
    }


@app.post("/internal/v1/nlp/normalize", response_model=NormalizeResponse)
def nlp_normalize(body: NormalizeRequest) -> NormalizeResponse:
    return NormalizeResponse(text=normalize(body.text))


@app.get("/internal/v1/models")
def list_models() -> list[dict]:
    return [
        {
            "name": m.name,
            "version": m.version,
            "runtime": m.runtime,
            "contextTokens": m.context_tokens,
            "minRamGb": m.min_ram_gb,
            "maxClassification": m.max_classification.name.lower(),
            "tasks": sorted(m.tasks),
        }
        for m in DEFAULT_MODELS
    ]
