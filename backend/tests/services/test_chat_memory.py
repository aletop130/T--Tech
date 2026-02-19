"""Unit tests for chat memory persistence and confirmation helpers."""

from __future__ import annotations

import pytest

from app.services.chat_memory import PostgreSQLChatMemory


@pytest.mark.asyncio
async def test_add_message_persists_message_metadata(db_session):
    memory = PostgreSQLChatMemory(
        db_session,
        session_id="memory-meta-session",
        tenant_id="default",
    )
    entry = await memory.add_message(
        content="hello",
        role="user",
        metadata={"source": "test-suite"},
    )
    assert entry.message_metadata == {"source": "test-suite"}


@pytest.mark.asyncio
async def test_context_maps_agent_role_to_assistant(db_session):
    memory = PostgreSQLChatMemory(
        db_session,
        session_id="memory-role-session",
        tenant_id="default",
    )
    await memory.add_message(content="agent event", role="agent")

    messages = await memory.get_context_as_messages(limit=10)
    assert messages[-1]["role"] == "assistant"
    assert messages[-1]["content"] == "agent event"


@pytest.mark.asyncio
async def test_pending_confirmation_lifecycle(db_session):
    memory = PostgreSQLChatMemory(
        db_session,
        session_id="memory-confirm-session",
        tenant_id="default",
    )
    await memory.add_message(
        content="pending op",
        role="system",
        metadata={
            "pending_confirmation": {
                "operation_id": "op-test-1",
                "resolved": False,
            }
        },
    )

    pending = await memory.get_latest_pending_confirmation()
    assert pending is not None
    assert pending["operation_id"] == "op-test-1"

    await memory.mark_confirmation_resolved("op-test-1")
    assert await memory.get_latest_pending_confirmation() is None
