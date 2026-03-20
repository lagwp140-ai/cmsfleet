#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cmsfleet/current}"
NGINX_AVAILABLE="/etc/nginx/sites-available/cmsfleet"
NGINX_ENABLED="/etc/nginx/sites-enabled/cmsfleet"

install -m 0644 "$APP_ROOT/deploy/ubuntu/nginx/cmsfleet.conf" "$NGINX_AVAILABLE"
ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
nginx -t
systemctl reload nginx

echo "Installed Nginx site configuration to $NGINX_AVAILABLE"