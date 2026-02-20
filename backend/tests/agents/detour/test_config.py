"""Tests for Detour LLM configuration defaults and tool wiring."""

import sys
import types

from app.agents.detour.config import DetourLLMConfig


def _snapshot_config() -> dict[str, object]:
    return {
        "max_model_len": DetourLLMConfig.max_model_len,
        "max_tokens": DetourLLMConfig.max_tokens,
    }


def _restore_config(snapshot: dict[str, object]) -> None:
    DetourLLMConfig.max_model_len = int(snapshot["max_model_len"])
    max_tokens = snapshot["max_tokens"]
    DetourLLMConfig.max_tokens = max_tokens if isinstance(max_tokens, int) else None


def test_common_kwargs_omit_max_tokens_when_unset() -> None:
    snapshot = _snapshot_config()
    try:
        DetourLLMConfig.max_model_len = 8192
        DetourLLMConfig.max_tokens = None

        kwargs = DetourLLMConfig._common_kwargs()

        assert "max_tokens" not in kwargs
        assert kwargs["model_kwargs"]["max_model_len"] == 8192
    finally:
        _restore_config(snapshot)


def test_get_llm_with_tools_merges_context_and_tools(monkeypatch) -> None:
    snapshot = _snapshot_config()
    try:
        DetourLLMConfig.max_model_len = 8192
        DetourLLMConfig.max_tokens = 1024
        captured: dict[str, object] = {}

        class FakeChatOpenAI:
            def __init__(self, **kwargs) -> None:
                captured.update(kwargs)

        monkeypatch.setitem(
            sys.modules,
            "langchain_openai",
            types.SimpleNamespace(ChatOpenAI=FakeChatOpenAI),
        )

        model = DetourLLMConfig.get_llm_with_tools([{"name": "screen"}])

        assert isinstance(model, FakeChatOpenAI)
        assert captured["max_tokens"] == 1024
        model_kwargs = captured["model_kwargs"]
        assert isinstance(model_kwargs, dict)
        assert model_kwargs["max_model_len"] == 8192
        assert model_kwargs["tools"] == [{"name": "screen"}]
        assert model_kwargs["tool_choice"] == "auto"
    finally:
        _restore_config(snapshot)
