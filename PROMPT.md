// WRITE_TARGET="/root/T--Tech/PROMPT.md"
// WRITE_CONTENT_LENGTH=0
# Prompt - Celestrak Debris Import Implementation

> **Goal:** Provide a concrete, step‑by‑step implementation plan to fetch space‑debris TLE data from Celestrak, ingest it into the SDA backend, and expose it to the front‑end.

---

## Implementation Plan

1. **Create fetch script** (`backend/scripts/fetch_celestrak_debris.py`)
   - Use `httpx.AsyncClient` to download `https://celestrak.com/NORAD/elements/debris.txt` (configurable via env var `CELERTRAK_DEBRIS_URL`).
   - Return raw text.
2. **Parse TLEs**
   - Write `parse_tle(text: str) -> List[Tuple[int, str, str]]` that iterates over lines two‑by‑two, extracts the NORAD ID from the first line (`int(line1.split()[1])`).
3. **Persist to DB**
   - Re‑use the insertion pattern from `backend/scripts/seed_debris.py`:
     - Insert a `Satellite` row with `object_type='debris'` and `is_active=True`.
     - Insert a matching `Orbit` row with the two TLE lines.
   - Use `ON CONFLICT DO NOTHING` for duplicate NORAD IDs.
4. **CLI entry point**
   - Add a `if __name__ == "__main__":` block that creates an async engine, obtains a session, and calls the import routine for the default tenant.
   - Provide usage: `python backend/scripts/fetch_celestrak_debris.py [--tenant <id>]`.
5. **(Optional) FastAPI endpoint**
   - Add `router.post("/debris/fetch-celestrak")` in `backend/app/api/v1/debris.py` protected by admin role.
   - Endpoint calls the same import function and returns `{status: "ok", imported: <count>}`.
6. **(Optional) UI button**
   - In `frontend/src/app/(main)/dashboard/page.tsx` add a button *“Refresh Celestrak Debris”*.
   - Calls the new endpoint, shows a loading spinner, and on success triggers the existing `loadDebris()` function.
7. **Scheduling (optional)**
   - Define a Celery beat task (`fetch_celestrak_debris_task`) scheduled nightly (`crontab(hour=2)`).
8. **Testing**
   - Unit test `test_parse_tle.py` with a small mock TLE payload.
   - Mock `httpx.get` for integration test of the full import routine.
   - If endpoint is added, integration test using `TestClient`.
9. **Documentation**
   - Add a *Celestrak Debris Import* section to `README.md` with command examples and UI instructions.
10. **Verification**
    - Run the script or API call.
    - Open `/map` and confirm new orange debris objects appear and count updates.
    - Ensure the 15‑second refresh on the map page reflects newly added objects.

---

## Iteration Protocol

- After completing each numbered step, run the associated checks (e.g., lint, type‑check, tests).
- If a step succeeds, **print exactly** `READY_FOR_NEXT_TASK`.
- When all steps are done, **print exactly** `COMPLETE`.

---
