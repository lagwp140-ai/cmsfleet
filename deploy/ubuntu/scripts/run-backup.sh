#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cmsfleet/current}"

"$APP_ROOT/deploy/ubuntu/scripts/backup-postgres.sh"
"$APP_ROOT/deploy/ubuntu/scripts/backup-config.sh"

echo "cmsfleet backup run completed"