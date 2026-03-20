#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cmsfleet/current}"

install -m 0644 "$APP_ROOT/deploy/ubuntu/systemd/cmsfleet-api.service" /etc/systemd/system/cmsfleet-api.service
install -m 0644 "$APP_ROOT/deploy/ubuntu/systemd/cmsfleet-worker.service" /etc/systemd/system/cmsfleet-worker.service
install -m 0644 "$APP_ROOT/deploy/ubuntu/systemd/cmsfleet-backup.service" /etc/systemd/system/cmsfleet-backup.service
install -m 0644 "$APP_ROOT/deploy/ubuntu/systemd/cmsfleet-backup.timer" /etc/systemd/system/cmsfleet-backup.timer

systemctl daemon-reload
systemctl enable cmsfleet-api.service cmsfleet-worker.service cmsfleet-backup.timer

echo "Installed systemd units from $APP_ROOT/deploy/ubuntu/systemd"