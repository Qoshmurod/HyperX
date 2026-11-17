"""Model tanlash.

Asosiy qoida: lokal model ishlamasa ham, maxfiy ma'lumot markaziy (bulut) modelga
avtomatik yuborilmaydi. Markaziy model faqat o'zi ruxsat etilgan daraja doirasida va
CENTRAL_ALLOWED_MAX dan oshmaydigan ma'lumot uchun ishlatiladi.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable

from .registry import Classification, ModelSpec

CENTRAL_ALLOWED_MAX = Classification.INTERNAL


class NoEligibleModelError(RuntimeError):
    def __init__(self, task: str, classification: Classification):
        super().__init__(f"no eligible model for task={task} classification={classification.name.lower()}")
        self.task = task
        self.classification = classification


def select_model(
    models: Iterable[ModelSpec],
    task: str,
    classification: Classification,
    is_healthy: Callable[[ModelSpec], bool],
    prefer_local: bool = True,
) -> ModelSpec:
    candidates = [
        m
        for m in models
        if task in m.tasks
        and classification <= m.max_classification
        and (m.runtime == "local" or classification <= CENTRAL_ALLOWED_MAX)
    ]
    candidates.sort(key=lambda m: (m.runtime != "local") if prefer_local else (m.runtime == "local"))
    for model in candidates:
        if is_healthy(model):
            return model
    raise NoEligibleModelError(task, classification)
