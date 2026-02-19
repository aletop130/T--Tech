"""Chat memory service with PostgreSQL backend and token window management."""
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

import tiktoken
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.chat_memory import ChatMemoryEntry, ChatMemorySummary, ChatSession


class PostgreSQLChatMemory:
    """Chat memory manager with PostgreSQL persistence and 100K token window."""
    
    def __init__(
        self,
        db_session: AsyncSession,
        max_tokens: int = 100000,
        session_id: str = "global",
        tenant_id: str = "default"
    ):
        self.db = db_session
        self.max_tokens = max_tokens
        self.session_id = session_id
        self.tenant_id = tenant_id
        self.encoder = tiktoken.get_encoding("cl100k_base")  # GPT-4 encoding
    
    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        return len(self.encoder.encode(text))
    
    async def _get_or_create_session(self) -> ChatSession:
        """Get existing session or create new one."""
        result = await self.db.execute(
            select(ChatSession).where(
                ChatSession.session_id == self.session_id,
                ChatSession.tenant_id == self.tenant_id
            )
        )
        session = result.scalar_one_or_none()
        
        if not session:
            session = ChatSession(
                id=str(uuid4()),
                session_id=self.session_id,
                tenant_id=self.tenant_id,
                max_tokens=self.max_tokens,
                current_token_count=0,
                window_percentage=0.0,
                message_count=0,
                active_agents=[]
            )
            self.db.add(session)
            await self.db.flush()
        
        return session
    
    async def add_message(
        self,
        content: str,
        role: str = "user",
        metadata: Optional[Dict[str, Any]] = None
    ) -> ChatMemoryEntry:
        """Add message to memory with token tracking."""
        # Get current session
        session = await self._get_or_create_session()
        
        # Count tokens
        token_count = self._count_tokens(content)
        
        # Calculate cumulative tokens
        result = await self.db.execute(
            select(func.coalesce(func.max(ChatMemoryEntry.cumulative_tokens), 0)).where(
                ChatMemoryEntry.session_id == self.session_id,
                ChatMemoryEntry.tenant_id == self.tenant_id
            )
        )
        last_cumulative = result.scalar() or 0
        new_cumulative = last_cumulative + token_count
        
        # Calculate window percentage
        window_percentage = (new_cumulative / self.max_tokens) * 100
        
        # If exceeding limit, trigger compression
        if new_cumulative > self.max_tokens:
            await self._compress_memory()
            # Recalculate after compression
            result = await self.db.execute(
                select(func.coalesce(func.max(ChatMemoryEntry.cumulative_tokens), 0)).where(
                    ChatMemoryEntry.session_id == self.session_id,
                    ChatMemoryEntry.tenant_id == self.tenant_id
                )
            )
            last_cumulative = result.scalar() or 0
            new_cumulative = last_cumulative + token_count
            window_percentage = (new_cumulative / self.max_tokens) * 100
        
        # Create memory entry
        entry = ChatMemoryEntry(
            id=str(uuid4()),
            session_id=self.session_id,
            tenant_id=self.tenant_id,
            role=role,
            content=content,
            token_count=token_count,
            cumulative_tokens=new_cumulative,
            window_percentage=window_percentage,
            message_metadata=metadata or {},
        )
        
        self.db.add(entry)
        
        # Update session stats
        session.current_token_count = new_cumulative
        session.window_percentage = window_percentage
        session.message_count += 1
        session.last_activity = datetime.utcnow()
        
        await self.db.flush()
        
        return entry
    
    async def get_context(self, limit: int = 50) -> List[ChatMemoryEntry]:
        """Get recent messages for context."""
        result = await self.db.execute(
            select(ChatMemoryEntry)
            .where(
                ChatMemoryEntry.session_id == self.session_id,
                ChatMemoryEntry.tenant_id == self.tenant_id
            )
            .order_by(desc(ChatMemoryEntry.created_at))
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def get_context_as_messages(self, limit: int = 50) -> List[Dict[str, str]]:
        """Get context formatted as OpenAI messages."""
        entries = await self.get_context(limit)
        # Reverse to get chronological order
        entries.reverse()
        
        messages = []
        for entry in entries:
            role = entry.role
            if role not in {"system", "user", "assistant", "tool"}:
                # OpenAI-compatible APIs reject unsupported roles like "agent".
                role = "assistant"
            messages.append({
                "role": role,
                "content": entry.content
            })
        
        return messages
    
    async def get_window_usage(self) -> Dict[str, Any]:
        """Get current window usage statistics."""
        session = await self._get_or_create_session()
        
        return {
            "current_tokens": session.current_token_count,
            "max_tokens": session.max_tokens,
            "percentage": session.window_percentage,
            "message_count": session.message_count,
            "active_agents": session.active_agents
        }
    
    async def update_active_agents(self, agents: List[str]):
        """Update list of currently active agents."""
        session = await self._get_or_create_session()
        session.active_agents = agents
        session.last_activity = datetime.utcnow()
        await self.db.flush()
    
    async def _compress_memory(self):
        """Compress old messages by summarizing them."""
        # Get oldest messages (bottom 30% of window)
        target_tokens = int(self.max_tokens * 0.3)
        
        result = await self.db.execute(
            select(ChatMemoryEntry)
            .where(
                ChatMemoryEntry.session_id == self.session_id,
                ChatMemoryEntry.tenant_id == self.tenant_id
            )
            .order_by(ChatMemoryEntry.created_at)
            .limit(100)  # Batch size
        )
        messages_to_summarize = list(result.scalars().all())
        
        if len(messages_to_summarize) < 10:
            return  # Too few to summarize
        
        # Calculate tokens in messages to summarize
        total_tokens = sum(m.token_count for m in messages_to_summarize)
        
        if total_tokens < target_tokens:
            return  # Not enough to compress
        
        # Create summary (in production, use LLM for summarization)
        summary_text = self._create_simple_summary(messages_to_summarize)
        summary_tokens = self._count_tokens(summary_text)
        
        # Store summary
        summary = ChatMemorySummary(
            id=str(uuid4()),
            session_id=self.session_id,
            tenant_id=self.tenant_id,
            summary_text=summary_text,
            start_message_id=messages_to_summarize[0].id,
            end_message_id=messages_to_summarize[-1].id,
            messages_summarized=len(messages_to_summarize),
            original_tokens=total_tokens,
            summary_tokens=summary_tokens
        )
        self.db.add(summary)
        
        # Delete old messages
        for msg in messages_to_summarize:
            await self.db.delete(msg)
        
        # Recalculate cumulative tokens for remaining messages
        await self._recalculate_cumulative_tokens()
        
        await self.db.flush()
    
    def _create_simple_summary(self, messages: List[ChatMemoryEntry]) -> str:
        """Create a simple summary of messages (replace with LLM in production)."""
        roles_count = {}
        for msg in messages:
            roles_count[msg.role] = roles_count.get(msg.role, 0) + 1
        
        summary = f"[Summary of {len(messages)} messages: "
        summary += ", ".join(f"{count} {role}" for role, count in roles_count.items())
        summary += "]"
        
        return summary
    
    async def _recalculate_cumulative_tokens(self):
        """Recalculate cumulative token counts after compression."""
        result = await self.db.execute(
            select(ChatMemoryEntry)
            .where(
                ChatMemoryEntry.session_id == self.session_id,
                ChatMemoryEntry.tenant_id == self.tenant_id
            )
            .order_by(ChatMemoryEntry.created_at)
        )
        messages = list(result.scalars().all())
        
        cumulative = 0
        for msg in messages:
            cumulative += msg.token_count
            msg.cumulative_tokens = cumulative
            msg.window_percentage = (cumulative / self.max_tokens) * 100
        
        # Update session
        session = await self._get_or_create_session()
        session.current_token_count = cumulative
        session.window_percentage = (cumulative / self.max_tokens) * 100
        
        await self.db.flush()
    
    async def clear_memory(self):
        """Clear all memory for this session."""
        # Delete all entries
        await self.db.execute(
            ChatMemoryEntry.__table__.delete().where(
                ChatMemoryEntry.session_id == self.session_id,
                ChatMemoryEntry.tenant_id == self.tenant_id
            )
        )
        
        # Delete summaries
        await self.db.execute(
            ChatMemorySummary.__table__.delete().where(
                ChatMemorySummary.session_id == self.session_id,
                ChatMemorySummary.tenant_id == self.tenant_id
            )
        )
        
        # Reset session
        session = await self._get_or_create_session()
        session.current_token_count = 0
        session.window_percentage = 0.0
        session.message_count = 0
        session.active_agents = []
        
        await self.db.flush()
    
    async def add_agent_event(
        self,
        agent_name: str,
        event_type: str,  # start, action, complete, error
        message: str,
        cesium_action: Optional[Dict[str, Any]] = None
    ):
        """Add agent event to memory with optional Cesium action."""
        metadata = {
            "agent_name": agent_name,
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        if cesium_action:
            metadata["cesium_action"] = cesium_action
        
        await self.add_message(
            content=message,
            role="agent",
            metadata=metadata
        )

    async def get_latest_pending_confirmation(self) -> Optional[Dict[str, Any]]:
        """Return the latest unresolved confirmation request for this session."""
        entries = await self.get_context(limit=100)
        for entry in entries:
            metadata = entry.message_metadata or {}
            pending = metadata.get("pending_confirmation")
            if pending and not pending.get("resolved", False):
                return pending
        return None

    async def mark_confirmation_resolved(self, operation_id: str) -> None:
        """Mark a pending confirmation as resolved by operation_id."""
        entries = await self.get_context(limit=100)
        for entry in entries:
            metadata = dict(entry.message_metadata or {})
            pending = metadata.get("pending_confirmation")
            if pending and pending.get("operation_id") == operation_id and not pending.get("resolved", False):
                pending["resolved"] = True
                pending["resolved_at"] = datetime.utcnow().isoformat()
                metadata["pending_confirmation"] = pending
                entry.message_metadata = metadata
                await self.db.flush()
                return
