"""Qdrant vektor bazasi. Har bir bo'lak hudud yo'li ajdodlari va maxfiylik darajasi bilan saqlanadi.

Qidiruv filtri faqat serverda, foydalanuvchi grantlaridan quriladi:
  (ajdodlar ∋ grant.p VA daraja ≤ grant.c) YOKI ... har bir grant uchun.
"""

from __future__ import annotations

import uuid

from qdrant_client import QdrantClient, models

from app.config import get_settings

from .embeddings import get_embedder

LEVEL = {"public": 0, "internal": 1, "confidential": 2, "secret": 3}


def ancestors(path: str) -> list[str]:
    parts = path.split(".")
    return [".".join(parts[: i + 1]) for i in range(len(parts))]


class VectorStore:
    def __init__(self) -> None:
        s = get_settings()
        if s.qdrant_url:
            self.client = QdrantClient(url=s.qdrant_url)
        elif s.qdrant_path == ":memory:":
            self.client = QdrantClient(location=":memory:")
        else:
            # Offline tugun: Qdrant serverisiz, lokal faylda
            self.client = QdrantClient(path=s.qdrant_path)
        self.embedder = get_embedder()
        self.collection = f"govmind_chunks_{self.embedder.name}"
        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                self.collection, vectors_config=models.VectorParams(size=self.embedder.dim, distance=models.Distance.COSINE)
            )
            for field, schema in (("document_id", "keyword"), ("ancestors", "keyword"), ("level", "integer")):
                self.client.create_payload_index(self.collection, field, field_schema=schema)

    def index(
        self, document_id: str, title: str, organization_id: str, path: str, level: int, chunks: list[tuple[int | None, str]]
    ) -> int:
        self.delete(document_id)
        if not chunks:
            return 0
        vectors = self.embedder.embed([f"{title}\n{text}" for _, text in chunks])
        points = [
            models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{document_id}:{i}")),
                vector=vec,
                payload={
                    "document_id": document_id,
                    "title": title,
                    "organization_id": organization_id,
                    "ancestors": ancestors(path),
                    "level": level,
                    "page": page,
                    "chunk": i,
                    "text": text,
                },
            )
            for i, ((page, text), vec) in enumerate(zip(chunks, vectors, strict=True))
        ]
        self.client.upsert(self.collection, points=points)
        return len(points)

    def delete(self, document_id: str) -> None:
        self.client.delete(
            self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(must=[models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id))])
            ),
        )

    @staticmethod
    def grant_filter(grants: list[dict]) -> models.Filter | None:
        should = [
            models.Filter(
                must=[
                    models.FieldCondition(key="ancestors", match=models.MatchValue(value=g["p"])),
                    models.FieldCondition(key="level", range=models.Range(lte=LEVEL[g["c"]])),
                ]
            )
            for g in grants
            if g.get("p") and g.get("c") in LEVEL
        ]
        return models.Filter(should=should) if should else None

    def search(self, query: str, grants: list[dict], limit: int = 8) -> list[dict]:
        flt = self.grant_filter(grants)
        if flt is None:
            return []  # grant yo'q — hech narsa topilmaydi
        vec = self.embedder.embed([query])[0]
        res = self.client.query_points(self.collection, query=vec, query_filter=flt, limit=limit, with_payload=True)
        return [
            {
                "document_id": p.payload["document_id"],
                "title": p.payload["title"],
                "page": p.payload.get("page"),
                "text": p.payload["text"],
                "score": round(float(p.score), 4),
            }
            for p in res.points
        ]


_store: VectorStore | None = None


def get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store


def reset_store() -> None:
    global _store
    _store = None
