"""SQLAlchemy base and database session management."""
from datetime import datetime
from typing import AsyncGenerator
from uuid import uuid4

from sqlalchemy import Column, DateTime, String, event
from sqlalchemy.engine import Engine
import sqlite3
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class TenantMixin:
    """Mixin for multi-tenant models."""
    tenant_id = Column(String(50), nullable=False, index=True, default="default")


class TimestampMixin:
    """Mixin for created/updated timestamps."""
    created_at = Column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )


class AuditMixin(TenantMixin, TimestampMixin):
    """Combined mixin for tenant + timestamps."""
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)


# Enable foreign key constraints on SQLite for testing and consistency
@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Set SQLite PRAGMA foreign_keys=ON."""
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        # Not a SQLite connection or pragma not supported
        pass

def generate_uuid() -> str:
    """Generate a new UUID string."""
    return str(uuid4())


# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

# Create async session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

