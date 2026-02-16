# -*- coding: utf-8 -*-
"""LLM configuration for Detour agents.

Provides a deterministic configuration for the Regolo.ai model used throughout the
Detour LangGraph pipeline. The class offers convenient shortcuts to obtain a
``ChatOpenAI`` instance, either plain or bound with a set of tools.
"""

from __future__ import annotations

from typing import Any, List

from app.core.config import settings
# ChatOpenAI is imported lazily inside methods to avoid import errors when dependencies are not installed


class DetourLLMConfig:
    """Configuration holder for the Regolo.ai LLM used by Detour.

    The configuration values are primarily taken from the global ``settings``
    instance (``app.core.config``).  Defaults are enforced according to the
    implementation plan:

    - model: ``gpt-oss-120b`` (or the value of ``REGOLO_MODEL``)
    - base_url: ``https://api.regolo.ai/v1`` (or ``REGOLO_BASE_URL``)
    - temperature: ``0.2`` – deterministic behaviour for agent prompts
    - max_tokens: ``4096`` (or ``REGOLO_MAX_TOKENS``)
    - timeout: ``60`` seconds – generous network timeout for cloud LLM calls
    """

    # Core model settings – fall back to the specification defaults if the
    # environment variable is missing.
    model: str = getattr(settings, "REGOLO_MODEL", "gpt-oss-120b")
    base_url: str = getattr(settings, "REGOLO_BASE_URL", "https://api.regolo.ai/v1")
    api_key: str | None = getattr(settings, "REGOLO_API_KEY", None)
    # The implementation plan mandates a deterministic temperature of 0.2.
    temperature: float = getattr(settings, "DETOUR_REGOLO_TEMPERATURE", 0.2)
    max_tokens: int = getattr(settings, "REGOLO_MAX_TOKENS", 4096)
    timeout: int = 60  # seconds, as required by the spec

    @classmethod
    def _common_kwargs(cls) -> dict[str, Any]:
        """Return keyword arguments shared by both LLM constructors.

        LangChain's ``ChatOpenAI`` forwards unknown keyword arguments to the
        underlying OpenAI client, which is compatible with Regolo.ai's API.
        """
        return {
            "model": cls.model,
            "temperature": cls.temperature,
            "max_tokens": cls.max_tokens,
            "api_key": cls.api_key,
            "base_url": cls.base_url,
            "request_timeout": cls.timeout,
        }

    @classmethod
    def get_llm(cls) -> Any:
        """Create a plain ``ChatOpenAI`` instance.

        Returns:
            ChatOpenAI: LLM ready for ``invoke`` / ``astream`` calls.
        """
        try:
            from langchain_openai import ChatOpenAI
        except Exception as e:
            raise ImportError("ChatOpenAI could not be imported. Ensure langchain-openai is installed.") from e
        return ChatOpenAI(**cls._common_kwargs())

    @classmethod
    def get_llm_with_tools(cls, tools: List[Any]) -> Any:
        """Create a ``ChatOpenAI`` instance that can call LangGraph tools.

        Args:
            tools: List of callables (functions) decorated with ``@tool`` from
                LangGraph. The tools are passed to the model so it can request
                function calls.

        Returns:
            ChatOpenAI: Configured LLM with ``tools`` and ``tool_choice`` set to
                ``"auto"`` to enable automatic tool selection.
        """
        kwargs = cls._common_kwargs()
        # ``ChatOpenAI`` accepts arbitrary model arguments via ``model_kwargs``.
        # We embed the tool configuration there – LangChain will forward them.
        kwargs.update({"model_kwargs": {"tools": tools, "tool_choice": "auto"}})
        try:
            from langchain_openai import ChatOpenAI
        except Exception as e:
            raise ImportError("ChatOpenAI could not be imported. Ensure langchain-openai is installed.") from e
        return ChatOpenAI(**kwargs)


__all__ = ["DetourLLMConfig"]
