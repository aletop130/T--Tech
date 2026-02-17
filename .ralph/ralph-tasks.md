// WRITE_TARGET="/root/T--Tech/.ralph/ralph-tasks.md"
// WRITE_CONTENT_LENGTH=0
# Ralph Tasks - Celestrak Debris Import

> **Goal:** Add an automated pipeline to fetch space‑debris TLE data from Celestrak, ingest it into the SDA backend, and expose it to the front‑end.

---

- [x] **Prerequisite Check**
  - Docker daemon running, project root is `/root/T--Tech`.

- [x] **Phase 1 – Add Celestrak fetch script**
  - Create `backend/scripts/fetch_celestrak_debris.py`.
  - Use `httpx` to download `https://celestrak.com/NORAD/elements/debris.txt`.
  - Configurable URL via `CELERTRAK_DEBRIS_URL` env var.

- [x] **Phase 2 – Parse & persist TLEs**
  - Implement `parse_tle(text: str) -> List[Tuple[int, str, str]]`.
  - Insert rows into `satellites` (`object_type='debris'`) and `orbits` using existing async session logic.
  - Skip duplicates (`ON CONFLICT DO NOTHING`).

- [x] **Phase 3 – CLI entry point**
  - Add `if __name__ == "__main__":` block to run import for a given tenant (default "default").
  - Document usage in README.

- [x] **Phase 4 – Optional FastAPI endpoint**
  - Add `POST /api/v1/debris/fetch-celestrak` (admin‑only) calling the same import routine.
  - Return simple JSON `{status: "ok", imported: <count>}`.

- [x] **Phase 5 – Optional UI button**
  - In Dashboard, add a button *“Refresh Celestrak Debris”*.
  - Calls the new endpoint, shows a spinner, and on success triggers `loadDebris()`.

- [x] **Phase 6 – Scheduling**
  - Add a Celery beat task to run the import nightly (e.g., `crontab(hour=2)`).

- [x] **Phase 7 – Tests & Documentation**
  - Unit test for `parse_tle` with a mocked HTTP response.
  - Integration test for the endpoint (if implemented).
  - Update `README.md` with commands and usage notes.

- [ ] **Phase 8 – Verification**
  - Run the script (`python backend/scripts/fetch_celestrak_debris.py`).
  - Open `/map` and confirm new debris appear (orange spheres, updated count).
  - Ensure periodic refresh works (15 s interval).

---
