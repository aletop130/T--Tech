#!/bin/bash

# Fast local frontend development
# Runs backend services in Docker, frontend locally with Turbopack
#
# Usage: ./dev-local.sh
#   Starts postgres, redis, minio, backend, celery in Docker
#   Then runs Next.js dev server locally with Turbopack HMR

set -e

echo "Starting backend services in Docker..."
docker-compose up -d postgres redis minio backend celery-worker celery-beat

echo ""
echo "Waiting for backend to be healthy..."
until curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  sleep 2
  echo "  waiting..."
done
echo "Backend is ready!"

echo ""
echo "Starting Next.js dev server locally (Turbopack)..."
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo ""

cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 bun run dev --turbo
