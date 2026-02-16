import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker
from app.db.base import Base
def main_sync():
    pass
async def main():
    # Import models to ensure metadata includes tables
    from app.db.models.ontology import Satellite
    from app.db.models.detour import DetourSatelliteState
    # Use in-memory SQLite async engine
    engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Query sqlite_master for table definitions
        result = await conn.exec_driver_sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='detour_satellite_state'")
        row = result.fetchone()
        print('detour_satellite_state schema:', row[0])
        # Check foreign_keys pragma
        result_fk = await conn.exec_driver_sql('PRAGMA foreign_keys')
        fk_val = result_fk.fetchone()
        print('PRAGMA foreign_keys:', fk_val[0])
        # Try inserting a DetourSatelliteState referencing non-existent satellite
        from app.db.base import generate_uuid
        async_session = async_sessionmaker(engine, expire_on_commit=False)
        async with async_session() as session:
            state = DetourSatelliteState(id=generate_uuid(), satellite_id='nonexistent', tenant_id='default')
            session.add(state)
            try:
                await session.flush()
            except Exception as e:
                print('Flush raised exception type:', type(e).__name__)
                print('Exception details:', e)
            else:
                print('Flush succeeded, no error')
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
