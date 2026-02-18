"""Add chat memory tables

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-02-18 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Chat Memory Entries
    op.create_table(
        'chat_memory',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(100), nullable=False),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('token_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cumulative_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('window_percentage', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('metadata', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_chat_memory_session', 'chat_memory', ['session_id'])
    op.create_index('ix_chat_memory_tenant', 'chat_memory', ['tenant_id'])
    op.create_index('ix_chat_memory_created', 'chat_memory', ['created_at'])
    op.create_index('ix_chat_memory_session_tenant', 'chat_memory', ['session_id', 'tenant_id'])

    # Chat Memory Summaries
    op.create_table(
        'chat_memory_summaries',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(100), nullable=False),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('summary_text', sa.Text(), nullable=False),
        sa.Column('start_message_id', sa.String(36), nullable=False),
        sa.Column('end_message_id', sa.String(36), nullable=False),
        sa.Column('messages_summarized', sa.Integer(), nullable=False),
        sa.Column('original_tokens', sa.Integer(), nullable=False),
        sa.Column('summary_tokens', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_chat_summary_session', 'chat_memory_summaries', ['session_id'])
    op.create_index('ix_chat_summary_tenant', 'chat_memory_summaries', ['tenant_id'])

    # Chat Sessions
    op.create_table(
        'chat_sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(100), nullable=False, unique=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('user_id', sa.String(50), nullable=True),
        sa.Column('current_token_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_tokens', sa.Integer(), nullable=False, server_default='100000'),
        sa.Column('window_percentage', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('message_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_activity', sa.DateTime(), nullable=False),
        sa.Column('active_agents', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_chat_session_session', 'chat_sessions', ['session_id'])
    op.create_index('ix_chat_session_tenant', 'chat_sessions', ['tenant_id'])
    op.create_index('ix_chat_session_user', 'chat_sessions', ['user_id'])
    op.create_index('ix_chat_session_activity', 'chat_sessions', ['last_activity'])


def downgrade() -> None:
    op.drop_table('chat_sessions')
    op.drop_table('chat_memory_summaries')
    op.drop_table('chat_memory')
