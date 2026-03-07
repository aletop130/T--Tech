"""Base agent using Regolo.ai (OpenAI function_calling format).

Adapted from ORBITAL SHIELD's Anthropic tool_use pattern to OpenAI
function_calling format as used by Regolo.ai.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Awaitable

from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str], Awaitable[None]] | None


def _get_client() -> AsyncOpenAI:
    """Get Regolo.ai OpenAI-compatible client."""
    return AsyncOpenAI(
        api_key=settings.REGOLO_API_KEY or "no-key",
        base_url=settings.REGOLO_BASE_URL,
    )


class BaseAgent:
    """Base class for all AI agents using Regolo.ai.

    Uses OpenAI function_calling format (not Anthropic tool_use).
    """

    name: str = "base"

    def __init__(self, on_progress: ProgressCallback = None):
        self.client = _get_client()
        self.on_progress = on_progress

    async def _notify(self, text: str) -> None:
        if self.on_progress:
            await self.on_progress(text)

    async def _call_llm(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> Any:
        """Call LLM via Regolo.ai (OpenAI-compatible API)."""
        full_messages = [{"role": "system", "content": system}] + messages

        kwargs: dict[str, Any] = {
            "model": settings.REGOLO_MODEL,
            "max_tokens": settings.REGOLO_MAX_TOKENS,
            "temperature": settings.REGOLO_TEMPERATURE,
            "messages": full_messages,
        }
        if tools:
            # Convert to OpenAI function_calling format
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        return await self.client.chat.completions.create(**kwargs)

    async def _run_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        tool_handlers: dict[str, Callable] | None = None,
        max_iterations: int | None = None,
    ) -> str:
        """Run LLM in a function_calling loop until it produces a final text response."""
        if max_iterations is None:
            max_iterations = settings.AGENT_MAX_ITERATIONS
        tool_handlers = tool_handlers or {}
        current_messages = list(messages)
        final_text = ""

        for _ in range(max_iterations):
            response = await self._call_llm(system, current_messages, tools)
            choice = response.choices[0]
            message = choice.message

            # Extract text content
            if message.content:
                final_text = message.content
                await self._notify(final_text[:200])

            # Check for tool calls (OpenAI function_calling format)
            tool_calls = message.tool_calls
            if not tool_calls:
                return final_text

            # Build assistant message with tool calls
            current_messages.append(message.model_dump())

            # Execute each tool call
            for tc in tool_calls:
                func_name = tc.function.name
                try:
                    func_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    func_args = {}

                handler = tool_handlers.get(func_name)
                if handler:
                    try:
                        result = handler(func_args)
                        result_str = json.dumps(result) if not isinstance(result, str) else result
                    except Exception as exc:
                        logger.exception("Tool %s failed", func_name)
                        result_str = json.dumps({"error": str(exc)})
                else:
                    result_str = json.dumps({"error": f"Unknown tool: {func_name}"})

                current_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                })

                await self._notify(f"[Tool: {func_name}] called")

        return final_text or "Agent reached max iterations."

    async def run(self, **kwargs: Any) -> Any:
        """Override in subclasses."""
        raise NotImplementedError
