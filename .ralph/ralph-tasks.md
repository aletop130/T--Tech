# Ralph Tasks - Production Build Automation

> **Goal:** Run `docker-compose up --build` in production mode, ensure containers start healthy, and verify the platform is operational.

---

- [x] Step 1 – Prerequisites
  - Verify Docker daemon is running (`docker info`).
  - Confirm you are in the project root (`/root/T--Tech`).

- [x] Step 2 – Stop existing containers
  - Execute `docker-compose down -v --remove-orphans` to stop and remove any running services.

- [ ] Step 3 – Build and start containers in production mode
  - Run `FRONTEND_MODE=build docker-compose up --build`.
  - Wait for health checks to pass:
    - Backend: `curl -f http://localhost:8000/health`
    - Frontend: `curl -f http://localhost:3000`

- [ ] Step 4 – Verify services
  - If both health checks succeed, output `BUILD_SUCCESS`.
  - If a container fails, capture its logs (`docker-compose logs <service>`) and address the issue, then repeat from Step 2.

- [ ] Step 5 – Completion
  - Print `COMPLETE` indicating the production build task finished successfully.

---
