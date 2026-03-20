#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/cmsfleet/postgres}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TMP_ENV="${TMP_ENV:-/etc/cmsfleet/backend-api.env}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ -f "$TMP_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$TMP_ENV" && set +a
fi

mkdir -p "$BACKUP_ROOT"

if [[ -n "${CMS_DATABASE_URL:-}" ]]; then
  pg_dump "$CMS_DATABASE_URL" --format=custom --file "$BACKUP_ROOT/cmsfleet-$TIMESTAMP.dump"
else
  : "${POSTGRES_DB:?POSTGRES_DB is required when CMS_DATABASE_URL is not set}"
  : "${POSTGRES_USER:?POSTGRES_USER is required when CMS_DATABASE_URL is not set}"
  : "${POSTGRES_HOST:=127.0.0.1}"
  : "${POSTGRES_PORT:=5432}"
  pg_dump --host "$POSTGRES_HOST" --port "$POSTGRES_PORT" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --file "$BACKUP_ROOT/cmsfleet-$TIMESTAMP.dump"
fi

find "$BACKUP_ROOT" -type f -name '*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "PostgreSQL backup written to $BACKUP_ROOT/cmsfleet-$TIMESTAMP.dump"