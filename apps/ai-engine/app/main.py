from __future__ import annotations

import os
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field

from app.analyst.explainer import explain
from app.analyst.planner import plan
from app.decisions.drafter import draft
from app.forecasting.models import anomalies, forecast
from app.model_gateway.gateway import get_gateway
from app.nlp.transliteration import normalize
from app.rag.answer import answer
from app.rag.extract import chunk, extract
from app.rag.store import get_store
from app.reports.commentary import commentary
from app.security.internal_auth import require_internal_token

app = FastAPI(title="GovMind AI Engine", version="1.0.0", docs_url="/internal/docs", openapi_url="/internal/openapi.json")

Lang = Literal["uz", "uz-Cyrl", "ru", "en"]
Classification = Literal["public", "internal", "confidential", "secret"]
Internal = [Depends(require_internal_token)]


class Grant(BaseModel):
    p: str = Field(max_length=1000)
    c: Classification


class NormalizeRequest(BaseModel):
    text: str = Field(max_length=100_000)


class PlanRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


class ExplainRequest(BaseModel):
    question: str = Field(max_length=4000)
    query_code: str
    rows: list[dict[str, Any]] = Field(max_length=5000)
    classification: Classification
    lang: Lang = "uz"
    params: dict[str, Any] = {}


class DraftRequest(BaseModel):
    problem: str = Field(max_length=10_000)
    evidence: list[dict[str, Any]] = []
    classification: Classification
    lang: Lang = "uz"


class Point(BaseModel):
    period: str
    value: float


class Scenario(BaseModel):
    change_pct: float = Field(ge=-90, le=500)


class ForecastRequest(BaseModel):
    series: list[Point] = Field(max_length=2000)
    horizon: int = Field(ge=1, le=60)
    season_length: int = Field(default=12, ge=0, le=60)
    scenario: Scenario | None = None


class AnomalyRequest(BaseModel):
    series: list[Point] = Field(max_length=2000)
    threshold: float = 3.0


class CommentaryRequest(BaseModel):
    report: dict[str, Any]
    classification: Classification
    lang: Lang = "uz"


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    grants: list[Grant]
    limit: int = Field(default=8, ge=1, le=50)


class AnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    grants: list[Grant]
    classification: Classification
    lang: Lang = "uz"


class DeleteRequest(BaseModel):
    document_id: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "govmind-ai-engine", "nodeRole": os.getenv("GOVMIND_NODE_ROLE", "local")}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/internal/v1/models", dependencies=Internal)
def list_models() -> list[dict]:
    return get_gateway().describe()


@app.post("/internal/v1/nlp/normalize", dependencies=Internal)
def nlp_normalize(body: NormalizeRequest) -> dict[str, str]:
    return {"text": normalize(body.text)}


@app.post("/internal/v1/analyst/plan", dependencies=Internal)
def analyst_plan(body: PlanRequest) -> dict:
    p = plan(body.question)
    return {
        "query_code": p.query_code,
        "params": p.params,
        "confidence": p.confidence,
        "intent": p.intent,
        "normalized": p.normalized,
    }


@app.post("/internal/v1/analyst/explain", dependencies=Internal)
def analyst_explain(body: ExplainRequest) -> dict:
    return explain(body.question, body.query_code, body.rows, body.classification, body.lang, body.params)


@app.post("/internal/v1/decisions/draft", dependencies=Internal)
def decisions_draft(body: DraftRequest) -> dict:
    return draft(body.problem, body.evidence, body.classification, body.lang)


@app.post("/internal/v1/forecast", dependencies=Internal)
def forecast_endpoint(body: ForecastRequest) -> dict:
    try:
        return forecast(
            [p.model_dump() for p in body.series],
            body.horizon,
            body.season_length,
            body.scenario.change_pct if body.scenario else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@app.post("/internal/v1/anomalies", dependencies=Internal)
def anomalies_endpoint(body: AnomalyRequest) -> dict:
    return {"anomalies": anomalies([p.model_dump() for p in body.series], body.threshold)}


@app.post("/internal/v1/reports/commentary", dependencies=Internal)
def reports_commentary(body: CommentaryRequest) -> dict:
    return commentary(body.report, body.classification, body.lang)


@app.post("/internal/v1/rag/index", dependencies=Internal)
async def rag_index(
    file: Annotated[UploadFile, File()],
    document_id: Annotated[str, Form()],
    title: Annotated[str, Form()],
    organization_id: Annotated[str, Form()],
    admin_unit_path: Annotated[str, Form(pattern=r"^[a-z0-9_]+(\.[a-z0-9_]+)*$")],
    classification_level: Annotated[int, Form(ge=0, le=3)],
) -> dict:
    data = await file.read()
    if len(data) > 30 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file too large")
    try:
        pages = extract(data, file.content_type or "", file.filename or "")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"cannot extract text: {e}") from e
    chunks = chunk(pages)
    n = get_store().index(document_id, title, organization_id, admin_unit_path, classification_level, chunks)
    has_pages = any(p.number for p in pages)
    return {"chunks": n, "pages": len(pages) if has_pages else None}


@app.post("/internal/v1/rag/search", dependencies=Internal)
def rag_search(body: SearchRequest) -> dict:
    return {"hits": get_store().search(body.query, [g.model_dump() for g in body.grants], body.limit)}


@app.post("/internal/v1/rag/answer", dependencies=Internal)
def rag_answer(body: AnswerRequest) -> dict:
    return answer(body.question, [g.model_dump() for g in body.grants], body.classification, body.lang)


@app.post("/internal/v1/rag/delete", dependencies=Internal)
def rag_delete(body: DeleteRequest) -> dict:
    get_store().delete(body.document_id)
    return {"deleted": True}
