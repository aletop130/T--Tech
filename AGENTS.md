## CODING RULES
## Tool contract: write()

Before calling `write`, you MUST validate arguments:

- `filePath`: required, must be a non-empty string.
- `content`: required, must be a string and MUST NOT be undefined.
- If either is missing/undefined/empty -> DO NOT call `write`. Regenerate the arguments first.

### Output hygiene
- Do not print “← Write …” or any other pseudo-tool syntax.
- Tool calls must be emitted only with fully-specified arguments.
- Do not use placeholders like “…”, “TODO”, “content omitted”. Always provide full file content.

### Write policy
- Use `write` only for:
  1) creating a new file, or
  2) fully replacing an existing file.
- For partial modifications, prefer `edit/patch` tools.
- Always include a quick debug line before each write:
  - `WRITE_TARGET="<filePath>"`
  - `WRITE_CONTENT_LENGTH=<number>`



# AGENTS.md - SDA Platform Development Guide
Every fix you do, restart frontend and backend 
## Project Overview

Space Domain Awareness (SDA) platform with a FastAPI Python backend and Next.js + React + TypeScript frontend. All services run in Docker containers with hot-reload support.

## Docker Development Workflow

**Note:** Opencode should not automatically start Docker containers; the user must run `docker-compose up` manually.

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart frontend (hot reload is automatic in dev mode)
docker-compose restart frontend

# Full rebuild
docker-compose up -d --build
```

**Important**: Frontend updates are hot-loaded. Only restart the container when adding new dependencies.

## Backend Commands

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run linting
ruff check .
mypy .

# Run type checking
mypy app/

# Run tests
pytest tests/ -v
pytest tests/test_api.py::test_health_check -v  # Single test
pytest tests/ --cov=app --cov-report=term-missing

# Run development server (inside container)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "description"
```

## Frontend Commands

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Run type checking
npx tsc --noEmit

# Run tests
npm test
npm test -- src/lib/api.test.ts    # Single test file
npm test -- --run                  # Non-interactive mode

# Post-install (Cesium assets)
npm run postinstall
```

## Code Style Guidelines

### Python (Backend)

**Imports**: Use isort, grouped: stdlib → third-party → local (relative imports last)

**Formatting**: Black (line length 100), no trailing commas

**Type Hints**: Required for function signatures. Use Pydantic v2 models for all request/response schemas.

**Naming Conventions**:
- `snake_case` for variables, functions, methods
- `PascalCase` for classes, Pydantic models
- `UPPER_SNAKE_CASE` for constants
- Prefix private methods with `_`

**Error Handling**:
- Use custom `SDAException` with proper HTTP status codes
- Return RFC 7807 Problem Details format
- Log all errors with structured logging (`structlog`)

**Project Structure**:
```
backend/app/
├── api/v1/     # API endpoints
├── core/       # Config, logging, exceptions
├── db/         # SQLAlchemy models, sessions
├── schemas/    # Pydantic models
└── services/   # Business logic
```

### TypeScript/React (Frontend)

**Imports**: Use path aliases (`@/*`), explicit named exports, no default exports for components

**Formatting**: Prettier (configured in `.prettierrc`)

**Type Safety**: Strict TypeScript mode, no `any`, use explicit interfaces

**Naming Conventions**:
- `camelCase` for variables, functions
- `PascalCase` for components, interfaces
- `UPPER_SAME_CASE` for constants

**Components**:
- Use `'use client'` for client-side components
- Functional components with hooks
- props interfaces with `Props` suffix

**State Management**:
- Use Zustand for global state (see `src/lib/store.ts`)
- Use SWR for data fetching (see `src/lib/api.ts`)
- Avoid `useState` for server state

**Project Structure**:
```
frontend/src/
├── app/        # Next.js App Router pages
├── components/ # React components (grouped by feature)
└── lib/        # Utilities, API client, store
```

## API Conventions

**Backend API Prefix**: `/api/v1`

**Tenant Isolation**: All requests require `X-Tenant-ID` header (default: `default`)

**Response Format**: Consistent JSON with error details in RFC 7807 format

**Frontend API Client**: Use `ApiClient` class in `src/lib/api.ts` - never call `fetch` directly

## Key Dependencies

**Backend**: FastAPI, SQLAlchemy async, Pydantic v2, Celery, pgvector

**Frontend**: Next.js 16, React 19, Blueprint.js, CesiumJS, satellite.js, Zustand, SWR

## Testing Notes

- Backend: pytest with httpx AsyncClient, pytest-asyncio
- Frontend: Vitest with React Testing Library
- Aim for unit tests on services and API endpoint tests
- Use fixtures from `tests/conftest.py`

## Security

- Never commit secrets or API keys
- All secrets via environment variables
- AI calls must go through backend (never from browser)
- Input validation on all endpoints
