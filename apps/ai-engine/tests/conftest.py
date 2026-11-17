import os

import pytest

os.environ.setdefault("AI_ENGINE_TOKEN", "test-token")
os.environ.pop("OLLAMA_URL", None)
os.environ.pop("CENTRAL_LLM_URL", None)
os.environ["QDRANT_PATH"] = ":memory:"


@pytest.fixture(autouse=True)
def _reset():
    from app.config import reset_settings
    from app.model_gateway.gateway import reset_gateway
    from app.rag.embeddings import reset_embedder
    from app.rag.store import reset_store

    reset_settings()
    reset_gateway()
    reset_embedder()
    reset_store()
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    c.headers["X-Internal-Token"] = "test-token"
    return c
