#!/bin/sh
set -eu

cd /app/backend

exec sh -c "PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000}"
