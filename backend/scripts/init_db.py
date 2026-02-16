#!/usr/bin/env python3
"""Initialize database tables."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings
from app.db.base import Base


async def init_db():
    """Create all tables."""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created successfully")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init_db())
