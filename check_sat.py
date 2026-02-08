import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

DATABASE_URL = "postgresql+asyncpg://sda:sda@localhost:5432/sda"

async def check():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine as con:
        async with AsyncSession(con) as session:
            from app.db.models.ontology import Satellite
            r = await session.execute(select(Satellite).limit(5))
            sats = r.scalars().all()
            print(f"Satelliti nel DB: {len(sats)}")
            for s in sats:
                print(f"  - {s.name} ({s.norad_id})")
    await engine.dispose()

asyncio.run(check())
