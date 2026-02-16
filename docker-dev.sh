#!/bin/bash

# Script to run docker-compose with dev or build mode for frontend
# Usage: ./docker-dev.sh [--dev|--build]
#   --dev    : Run frontend in development mode (npm run dev)
#   --build  : Run frontend in production build mode (npm run build && npm start) [default]

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
    --help|-h)
      echo "Usage: ./docker-dev.sh [--dev|--build] [docker-compose-args]"
      echo ""
      echo "Options:"
      echo "  --dev     Run frontend in development mode (hot-reload)"
      echo "  --build   Run frontend in production build mode [default]"
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

FRONTEND_MODE=$MODE docker-compose up "$@"
