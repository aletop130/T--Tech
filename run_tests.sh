#!/bin/bash
set -e

echo "=== SDA Platform Test Suite ==="

# Rebuild images (only backend and frontend needed for tests)
echo "Rebuilding backend and frontend images..."
docker-compose build backend frontend

# Start infrastructure services (postgres, redis, minio for completeness)
echo "Starting infrastructure services..."
docker-compose up -d postgres redis minio

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
docker-compose ps

# Run backend tests inside container
echo "Running backend tests..."
docker-compose exec -T backend pytest tests/ -v

# Run frontend tests inside container
echo "Running frontend tests..."
docker-compose exec -T frontend bun run test --run

echo "=== All tests passed ==="
