WRITE_TARGET="/root/T--Tech/.ralph/ralph-tasks.md"
WRITE_CONTENT_LENGTH=2000
# Ralph Tasks - Frontend Build Automation

> **Goal:** Run `npm run build` repeatedly until it succeeds without errors.

---

- [/] Step 1 – Clean environment
  - Remove previous build artifacts: `rm -rf ./frontend/.next ./frontend/node_modules`
  - Reset any local changes: `git reset --hard HEAD`

- [ ] Step 2 – Install exact dependencies
  - Run `npm ci` inside `./frontend`
  - If installation fails, output `DEPENDENCY_INSTALL_FAILED` and abort the plan.

- [ ] Step 3 – Build loop
  - Increment a counter `BUILD_ATTEMPT_<n>` before each attempt.
  - Execute `npm run build`.
  - If exit code is `0`:
    - Print `BUILD_SUCCESS`
    - Print `COMPLETE`
    - End the plan.
  - If the command fails:
    - Capture the error output and print `ERROR_LOG`.
    - **Error handling**:
      - *Missing packages*: run `npm install` then retry.
      - *TypeScript errors*: run `npm run lint` or `npx tsc --noEmit` to locate; apply fixes manually or with automated scripts.
      - *Webpack/Turbopack config issues*: modify `next.config.js` to add the appropriate flag (`--webpack` or `--turbopack`).
      - *Other failures*: print `BUILD_ERROR` and pause for manual intervention.
    - After fixing, print `READY_FOR_NEXT_TASK` and loop back to the build step.

- [ ] Step 4 – Verify runtime
  - Once the build succeeds, run `npm start` (with `FRONTEND_MODE=build`) to ensure the application starts correctly.
  - Print `RUNTIME_VERIFIED` if the server starts without errors.

---

## Monitoring & Reporting
- After each iteration, Ralph should emit:
  - `BUILD_ATTEMPT_<n>` – the attempt number.
  - `ERROR_LOG` – detailed error output (if any).
  - `READY_FOR_NEXT_TASK` – when the current issue has been addressed.
- Upon successful build, emit `BUILD_SUCCESS` followed by `COMPLETE`.

## Notes
- Ensure Docker containers are stopped before running local builds to avoid file locks.
- Keep the console output clean for easy parsing by Ralph.