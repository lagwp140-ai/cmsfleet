#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cmsfleet/current}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/cmsfleet/config}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TMP_DIR="$(mktemp -d)"

mkdir -p "$BACKUP_ROOT"
mkdir -p "$TMP_DIR/etc-cmsfleet"

if [[ -d /etc/cmsfleet ]]; then
  cp -R /etc/cmsfleet/. "$TMP_DIR/etc-cmsfleet/"
fi

if [[ -d "$APP_ROOT/config/cms" ]]; then
  cp -R "$APP_ROOT/config/cms" "$TMP_DIR/config-cms"
fi

tar -C "$TMP_DIR" -czf "$BACKUP_ROOT/cmsfleet-config-$TIMESTAMP.tar.gz" .
rm -rf "$TMP_DIR"
find "$BACKUP_ROOT" -type f -name '*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Configuration backup written to $BACKUP_ROOT/cmsfleet-config-$TIMESTAMP.tar.gz"