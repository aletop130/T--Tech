"""Add sandbox tables

Revision ID: 005_sandbox_tables
Revises: 004_threat_tables
Create Date: 2026-03-11 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '005_sandbox_tables'
down_revision: Union[str, None] = '004_threat_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sandbox Sessions
    op.create_table(
        'sandbox_sessions',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('user_id', sa.String(100), nullable=False),
        sa.Column('name', sa.String(200), nullable=False, server_default='Untitled Sandbox'),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('is_saved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('initial_prompt', sa.Text(), nullable=True),
        sa.Column('current_time_seconds', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('time_multiplier', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_sandbox_sessions_user_id', 'sandbox_sessions', ['user_id'])
    op.create_index('ix_sandbox_sessions_status', 'sandbox_sessions', ['status'])
    op.create_index('ix_sandbox_sessions_tenant_id', 'sandbox_sessions', ['tenant_id'])
    op.create_index('ix_sandbox_sessions_tenant_user', 'sandbox_sessions', ['tenant_id', 'user_id'])

    # Sandbox Actors
    op.create_table(
        'sandbox_actors',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('session_id', sa.String(50), sa.ForeignKey('sandbox_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('actor_class', sa.String(40), nullable=False),
        sa.Column('actor_type', sa.String(40), nullable=False),
        sa.Column('subtype', sa.String(80), nullable=True),
        sa.Column('faction', sa.String(20), nullable=False, server_default='neutral'),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('provenance', sa.String(30), nullable=False, server_default='manual'),
        sa.Column('visual_config', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('state', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('initial_state', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('capabilities', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('behavior', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('source_ref', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_sandbox_actors_session_id', 'sandbox_actors', ['session_id'])
    op.create_index('ix_sandbox_actors_actor_class', 'sandbox_actors', ['actor_class'])
    op.create_index('ix_sandbox_actors_actor_type', 'sandbox_actors', ['actor_type'])
    op.create_index('ix_sandbox_actors_tenant_id', 'sandbox_actors', ['tenant_id'])
    op.create_index('ix_sandbox_actors_session_label', 'sandbox_actors', ['session_id', 'label'])
    op.create_index('ix_sandbox_actors_tenant_type', 'sandbox_actors', ['tenant_id', 'actor_type'])

    # Sandbox Scenario Items
    op.create_table(
        'sandbox_scenario_items',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('session_id', sa.String(50), sa.ForeignKey('sandbox_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('item_type', sa.String(30), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('source_type', sa.String(50), nullable=True),
        sa.Column('source_id', sa.String(100), nullable=True),
        sa.Column('payload', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_sandbox_items_session_id', 'sandbox_scenario_items', ['session_id'])
    op.create_index('ix_sandbox_items_item_type', 'sandbox_scenario_items', ['item_type'])
    op.create_index('ix_sandbox_items_tenant_id', 'sandbox_scenario_items', ['tenant_id'])
    op.create_index('ix_sandbox_items_session_type', 'sandbox_scenario_items', ['session_id', 'item_type'])

    # Sandbox Commands
    op.create_table(
        'sandbox_commands',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('session_id', sa.String(50), sa.ForeignKey('sandbox_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('command_type', sa.String(60), nullable=False),
        sa.Column('source', sa.String(20), nullable=False, server_default='manual'),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('payload', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_sandbox_commands_session_id', 'sandbox_commands', ['session_id'])
    op.create_index('ix_sandbox_commands_command_type', 'sandbox_commands', ['command_type'])
    op.create_index('ix_sandbox_commands_tenant_id', 'sandbox_commands', ['tenant_id'])
    op.create_index('ix_sandbox_commands_session_created', 'sandbox_commands', ['session_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('sandbox_commands')
    op.drop_table('sandbox_scenario_items')
    op.drop_table('sandbox_actors')
    op.drop_table('sandbox_sessions')
