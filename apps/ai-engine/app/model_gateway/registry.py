from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Literal


class Classification(IntEnum):
    PUBLIC = 0
    INTERNAL = 1
    CONFIDENTIAL = 2
    SECRET = 3

    @classmethod
    def parse(cls, value: str) -> Classification:
        return cls[value.upper()]


Runtime = Literal["local", "central"]


@dataclass(frozen=True)
class ModelSpec:
    name: str
    version: str
    runtime: Runtime
    context_tokens: int
    min_ram_gb: int
    max_classification: Classification
    tasks: frozenset[str]


# Boshlang'ich reestr. Real o'rnatishda konfiguratsiya faylidan yuklanadi.
DEFAULT_MODELS: tuple[ModelSpec, ...] = (
    ModelSpec(
        name="qwen2.5-7b-instruct",
        version="q4_K_M",
        runtime="local",
        context_tokens=32_768,
        min_ram_gb=8,
        max_classification=Classification.CONFIDENTIAL,
        tasks=frozenset({"chat", "summarize", "analyze"}),
    ),
    ModelSpec(
        name="central-large",
        version="1",
        runtime="central",
        context_tokens=128_000,
        min_ram_gb=80,
        max_classification=Classification.INTERNAL,
        tasks=frozenset({"chat", "summarize", "analyze", "report"}),
    ),
)
