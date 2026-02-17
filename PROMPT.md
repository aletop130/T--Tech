# Prompt - Production Build Automation

> **Goal:** Run the full platform build in production mode using Docker Compose and verify that all services start healthy.

---

- **Prerequisites**
  - Docker daemon must be running (`docker info`).
  - Execute commands from the project root (`/root/T--Tech`).

- **Steps**
  1. **Stop any existing containers**
     ```bash
     docker-compose down
     ```
  2. **Build and start containers in production mode**
     ```bash
     FRONTEND_MODE=build docker-compose up -d --build
     ```
  3. **Health‑check verification**
     - Backend: `curl -f http://localhost:8000/health`
     - Frontend: `curl -f http://localhost:3000`
     - If a health check fails, capture logs with `docker-compose logs <service>` and resolve the issue, then repeat from step 1.
  4. **Completion**
     - When both health checks succeed, output `BUILD_SUCCESS`.
     - Finally print `COMPLETE` to indicate the production build task is finished.

---

- **Iteration protocol**
  - After each step, run the relevant checks.
  - If the current step completes successfully, print **exactly** `READY_FOR_NEXT_TASK`.
  - When all steps are done, print **exactly** `COMPLETE`.

- **Notes**
  - Do not modify application code; focus solely on the container build and deployment process.
  - Update `.ralph/ralph-tasks.md` marking tasks as completed (`[x]`).
