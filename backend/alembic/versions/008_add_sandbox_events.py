"""Add sandbox_events table for scheduled timeline events.

Revision ID: 008_sandbox_events
Revises: 007_add_sandbox_duration
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = "008_sandbox_events"
down_revision = "007_sandbox_duration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sandbox_events",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("session_id", sa.String(50), sa.ForeignKey("sandbox_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("event_type", sa.String(40), nullable=False, index=True),
        sa.Column("trigger_seconds", sa.Float, nullable=False),
        sa.Column("target_label", sa.String(200), nullable=True),
        sa.Column("payload", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("fired", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("tenant_id", sa.String(50), nullable=False, index=True, server_default="default"),
        sa.Column("created_by", sa.String(50), nullable=True),
        sa.Column("updated_by", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sandbox_events_session_trigger", "sandbox_events", ["session_id", "trigger_seconds"])


def downgrade() -> None:
    op.drop_table("sandbox_events")
