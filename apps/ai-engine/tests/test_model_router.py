import pytest

from app.model_gateway.registry import DEFAULT_MODELS, Classification
from app.model_gateway.router import NoEligibleModelError, select_model


def healthy(*names: str):
    return lambda m: m.name in names


ALL = {m.name for m in DEFAULT_MODELS}


def test_prefers_local_model() -> None:
    m = select_model(DEFAULT_MODELS, "chat", Classification.INTERNAL, healthy(*ALL))
    assert m.runtime == "local"


def test_internal_data_may_fall_back_to_central() -> None:
    m = select_model(DEFAULT_MODELS, "chat", Classification.INTERNAL, healthy("central-large"))
    assert m.runtime == "central"


@pytest.mark.parametrize("level", [Classification.CONFIDENTIAL, Classification.SECRET])
def test_sensitive_data_never_goes_to_central(level: Classification) -> None:
    with pytest.raises(NoEligibleModelError):
        select_model(DEFAULT_MODELS, "chat", level, healthy("central-large"))


def test_secret_requires_model_cleared_for_secret() -> None:
    with pytest.raises(NoEligibleModelError):
        select_model(DEFAULT_MODELS, "chat", Classification.SECRET, healthy(*ALL))


def test_unknown_task() -> None:
    with pytest.raises(NoEligibleModelError):
        select_model(DEFAULT_MODELS, "translate", Classification.PUBLIC, healthy(*ALL))
