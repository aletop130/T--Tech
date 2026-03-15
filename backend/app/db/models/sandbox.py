"""Sandbox models for isolated scenario authoring and runtime state."""
from sqlalchemy import Boolean, Column, Float, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base, AuditMixin, generate_uuid


class SandboxSession(Base, AuditMixin):
    """Per-user isolated sandbox workspace."""

    __tablename__ = "sandbox_sessions"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    user_id = Column(String(100), nullable=False, index=True)
    name = Column(String(200), nullable=False, default="Untitled Sandbox")
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    is_saved = Column(Boolean, nullable=False, default=False)
    initial_prompt = Column(Text, nullable=True)
    current_time_seconds = Column(Float, nullable=False, default=0.0)
    time_multiplier = Column(Float, nullable=False, default=1.0)
    duration_seconds = Column(Float, nullable=True)

    actors = relationship(
        "SandboxActor",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SandboxActor.created_at",
    )
    scenario_items = relationship(
        "SandboxScenarioItem",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SandboxScenarioItem.created_at",
    )
    commands = relationship(
        "SandboxCommand",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SandboxCommand.created_at",
    )

    __table_args__ = (
        Index("ix_sandbox_sessions_tenant_user", "tenant_id", "user_id"),
    )


class SandboxActor(Base, AuditMixin):
    """Sandbox-local actor cloned from live data or created manually."""

    __tablename__ = "sandbox_actors"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_id = Column(
        String(50),
        ForeignKey("sandbox_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_class = Column(String(40), nullable=False, index=True)
    actor_type = Column(String(40), nullable=False, index=True)
    subtype = Column(String(80), nullable=True)
    faction = Column(String(20), nullable=False, default="neutral")
    label = Column(String(200), nullable=False)
    provenance = Column(String(30), nullable=False, default="manual")
    visual_config = Column(JSON, nullable=False, default=dict)
    state = Column(JSON, nullable=False, default=dict)
    initial_state = Column(JSON, nullable=False, default=dict)
    capabilities = Column(JSON, nullable=False, default=dict)
    behavior = Column(JSON, nullable=False, default=dict)
    source_ref = Column(JSON, nullable=False, default=dict)

    session = relationship("SandboxSession", back_populates="actors")

    __table_args__ = (
        Index("ix_sandbox_actors_session_label", "session_id", "label"),
        Index("ix_sandbox_actors_tenant_type", "tenant_id", "actor_type"),
    )


class SandboxScenarioItem(Base, AuditMixin):
    """Sandbox-local non-actor imports like events, modifiers, and objectives."""

    __tablename__ = "sandbox_scenario_items"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_id = Column(
        String(50),
        ForeignKey("sandbox_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_type = Column(String(30), nullable=False, index=True)
    label = Column(String(200), nullable=False)
    source_type = Column(String(50), nullable=True)
    source_id = Column(String(100), nullable=True)
    payload = Column(JSON, nullable=False, default=dict)

    session = relationship("SandboxSession", back_populates="scenario_items")

    __table_args__ = (
        Index("ix_sandbox_items_session_type", "session_id", "item_type"),
    )


class SandboxCommand(Base, AuditMixin):
    """Replayable sandbox command history."""

    __tablename__ = "sandbox_commands"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_id = Column(
        String(50),
        ForeignKey("sandbox_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    command_type = Column(String(60), nullable=False, index=True)
    source = Column(String(20), nullable=False, default="manual")
    summary = Column(Text, nullable=False)
    payload = Column(JSON, nullable=False, default=dict)

    session = relationship("SandboxSession", back_populates="commands")

    __table_args__ = (
        Index("ix_sandbox_commands_session_created", "session_id", "created_at"),
    )
