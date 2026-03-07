#!/bin/bash

# Script to run docker-compose with dev or build mode for frontend
# Usage: ./docker-dev.sh [--dev|--build|--local]
#   --dev    : Run frontend in development mode inside Docker (bun run dev)
#   --build  : Run frontend in production build mode (bun run build && bun run start) [default]
#   --local  : Run only backend in Docker, frontend locally with Turbopack (FASTEST)

MODE="build"

while [[ $# -gt 0 ]]; do
  case $1 in
    --dev)
      MODE="dev"
      shift
      ;;
    --build)
      MODE="build"
      shift
      ;;
    --local)
      echo "Starting backend services in Docker, frontend locally..."
      echo "This is the FASTEST dev mode (Turbopack HMR, no Docker filesystem overhead)"
      echo ""
      exec ./dev-local.sh
      ;;
    --help|-h)
      echo "Usage: ./docker-dev.sh [--dev|--build|--local] [docker-compose-args]"
      echo ""
      echo "Options:"
      echo "  --dev     Run frontend in development mode inside Docker (hot-reload)"
      echo "  --build   Run frontend in production build mode [default]"
      echo "  --local   FASTEST: backend in Docker, frontend locally with Turbopack"
      echo "  --help    Show this help message"
      echo ""
      echo "Any additional arguments are passed to docker-compose up"
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

echo "Starting Docker Compose with FRONTEND_MODE=$MODE"
echo "Passing additional args: $@"
echo ""
echo "TIP: Use --local for fastest frontend development (Turbopack HMR)"

DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 FRONTEND_MODE=$MODE docker-compose up "$@"
