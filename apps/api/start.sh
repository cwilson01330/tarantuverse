#!/bin/bash
# Startup script for Render - runs migrations then starts the server

# Fail the deploy if any step fails.
#
# This used to be absent, and it hid a real problem for a long time: the
# migration graph drifted into four heads, `alembic upgrade head` started
# erroring with "Multiple head revisions are present", and because the
# script carried on regardless, uvicorn booted anyway. Migrations were
# silently no-oping on every deploy while the API came up looking healthy.
#
# A failed migration must stop the deploy. Render keeps the previous
# release serving when a deploy fails, which is far safer than booting new
# code against a schema that was never migrated — that produces 500s which
# look like application bugs and cost hours to trace back here.
set -euo pipefail

# Change to the API directory
cd apps/api

echo "Running database migrations..."
alembic upgrade head

echo "Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
