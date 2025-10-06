#!/bin/bash
# Startup script for Render - runs migrations then starts the server

# Change to the API directory
cd apps/api

echo "Running database migrations..."
alembic upgrade head

echo "Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
