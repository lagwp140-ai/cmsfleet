#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="${1:-$(pwd)}"
APP_ROOT="${APP_ROOT:-/opt/cmsfleet/current}"
RUN_USER="${RUN_USER:-buscms}"
RUN_GROUP="${RUN_GROUP:-buscms}"

mkdir -p "$APP_ROOT" /var/log/cmsfleet /var/backups/cmsfleet/postgres /var/backups/cmsfleet/config /var/www/cmsfleet /etc/cmsfleet

rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "frontend/web/dist" \
  "$SOURCE_ROOT/" "$APP_ROOT/"

chown -R "$RUN_USER:$RUN_GROUP" "$APP_ROOT" /var/log/cmsfleet /var/backups/cmsfleet /var/www/cmsfleet

"$APP_ROOT/deploy/ubuntu/scripts/build-release.sh"

systemctl daemon-reload
systemctl enable cmsfleet-api.service cmsfleet-worker.service cmsfleet-backup.timer
systemctl restart cmsfleet-api.service cmsfleet-worker.service
systemctl reload nginx

echo "Deployment completed to $APP_ROOT"