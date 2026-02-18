"""Rename metadata to message_metadata in chat_memory

Revision ID: 8f8ee6ebf4ef
Revises: c1d2e3f4a5b6
Create Date: 2026-02-18 13:55:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = '8f8ee6ebf4ef'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('chat_memory', 'metadata', new_column_name='message_metadata')


def downgrade() -> None:
    op.alter_column('chat_memory', 'message_metadata', new_column_name='metadata')
