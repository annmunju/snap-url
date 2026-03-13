#!/bin/sh
set -eu

cd /app/backend

echo "[railway-predeploy] pwd=$(pwd)"
echo "[railway-predeploy] environment=${ENVIRONMENT:-unset}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[railway-predeploy] DATABASE_URL is not set"
  exit 1
fi

PYTHONPATH=. alembic -c alembic.ini upgrade head
