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
