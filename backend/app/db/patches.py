"""Patch module to work around HSTORE on_connect issue.

This monkey‑patch replaces the ``psycopg2.extras.HstoreAdapter.get_oids`` function
with a dummy implementation that returns placeholder OIDs. The real OIDs are
not required for the operation of the SDA platform – the function is only used
by SQLAlchemy's ``on_connect`` hook to register the HSTORE type. In environments
where the ``get_oids`` query fails (e.g., due to a transaction abort during the
initial connection), the dummy implementation prevents the exception and allows
Alembic migrations to run.
"""

try:
    # Import the original adapter
    from psycopg2.extras import HstoreAdapter

    def _dummy_get_oids(conn):
        """Return placeholder OIDs for hstore.

        The actual values are not used by the application; they are only needed
        to satisfy the adapter's expectations. Returning a pair of zero OIDs is
        sufficient to avoid the ``InternalError`` that occurs in some setups.
        """
        return ((0,), (0,))

    # Apply the monkey‑patch globally
    HstoreAdapter.get_oids = _dummy_get_oids
except Exception:
    # If psycopg2 is not available (e.g., during type checking) we silently ignore the patch.
    pass

# asyncpg / SQLAlchemy cancellation hardening
#
# Under client disconnects, request cancellation can interrupt asyncpg close()
# inside SQLAlchemy connection adapters, producing noisy "Exception terminating
# connection" traces and leaving cleanup to GC. These monkey-patches make close
# and terminate resilient to CancelledError by falling back to terminate().
try:
    import asyncio
    from sqlalchemy import util
    from sqlalchemy.dialects.postgresql.asyncpg import AsyncAdapt_asyncpg_connection

    def _safe_asyncpg_terminate(self):
        if util.concurrency.in_greenlet():
            try:
                self.await_(self._connection.close(timeout=2))
            except (asyncio.TimeoutError, asyncio.CancelledError):
                try:
                    self._connection.terminate()
                except Exception:
                    pass
        else:
            try:
                self._connection.terminate()
            except Exception:
                pass
        self._started = False

    def _safe_asyncpg_close(self):
        self.rollback()
        try:
            self.await_(self._connection.close())
        except asyncio.CancelledError:
            try:
                self._connection.terminate()
            except Exception:
                pass

    AsyncAdapt_asyncpg_connection.terminate = _safe_asyncpg_terminate
    AsyncAdapt_asyncpg_connection.close = _safe_asyncpg_close
except Exception:
    # If SQLAlchemy asyncpg internals change or aren't available, ignore patch.
    pass
