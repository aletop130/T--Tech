"""Chat memory models for conversation history with token management."""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, Integer, JSON, String, Text

from app.db.base import Base


class ChatMemoryEntry(Base):
    """Stores chat messages with metadata for context window management."""
    
    __tablename__ = "chat_memory"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String(100), nullable=False, index=True, default="global")
    tenant_id = Column(String(50), nullable=False, index=True, default="default")
    
    # Message content
    role = Column(String(20), nullable=False)  # user, assistant, system, agent
    content = Column(Text, nullable=False)
    
    # Token management
    token_count = Column(Integer, nullable=False, default=0)
    cumulative_tokens = Column(Integer, nullable=False, default=0)  # Running total up to this message
    
    # Context window info
    window_percentage = Column(Float, nullable=False, default=0.0)  # % of 100K window used
    
    # Metadata for agent tracking
    message_metadata = Column(JSON, nullable=True, default=dict)  # {agent_name, action_type, cesium_action, etc.}
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    def __repr__(self):
        return f"<ChatMemoryEntry(id={self.id}, role={self.role}, tokens={self.token_count})>"


class ChatMemorySummary(Base):
    """Stores periodic summaries of chat history to compress context."""
    
    __tablename__ = "chat_memory_summaries"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String(100), nullable=False, index=True, default="global")
    tenant_id = Column(String(50), nullable=False, index=True, default="default")
    
    # Summary info
    summary_text = Column(Text, nullable=False)
    start_message_id = Column(String(36), nullable=False)
    end_message_id = Column(String(36), nullable=False)
    messages_summarized = Column(Integer, nullable=False)
    
    # Token savings
    original_tokens = Column(Integer, nullable=False)
    summary_tokens = Column(Integer, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<ChatMemorySummary(summarized={self.messages_summarized}, saved={self.original_tokens - self.summary_tokens})>"


class ChatSession(Base):
    """Tracks active chat sessions with context window status."""
    
    __tablename__ = "chat_sessions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String(100), nullable=False, unique=True, index=True, default="global")
    tenant_id = Column(String(50), nullable=False, index=True, default="default")
    user_id = Column(String(50), nullable=True)
    
    # Context window status
    current_token_count = Column(Integer, nullable=False, default=0)
    max_tokens = Column(Integer, nullable=False, default=100000)  # 100K default
    window_percentage = Column(Float, nullable=False, default=0.0)
    
    # Session metadata
    message_count = Column(Integer, nullable=False, default=0)
    last_activity = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Active agents in session
    active_agents = Column(JSON, nullable=True, default=list)  # ["scout", "analyst", ...]
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<ChatSession({self.session_id}, tokens={self.current_token_count}/{self.max_tokens})>"
