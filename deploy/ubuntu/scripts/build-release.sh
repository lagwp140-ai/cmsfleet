#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cmsfleet/current}"
STATIC_ROOT="${STATIC_ROOT:-/var/www/cmsfleet}"

cd "$APP_ROOT"

mkdir -p "$STATIC_ROOT"

npm ci
npm run build

rm -rf "$STATIC_ROOT"/*
cp -R frontend/web/dist/. "$STATIC_ROOT/"

echo "Build completed for $APP_ROOT"
echo "Frontend assets published to $STATIC_ROOT"