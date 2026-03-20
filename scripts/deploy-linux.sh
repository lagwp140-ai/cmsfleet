#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_USER="${CMS_DEPLOY_USER:-buscms}"
RESTART_COMMAND="${CMS_RESTART_COMMAND:-}"
SKIP_INSTALL=0
SKIP_MIGRATIONS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-migrations)
      SKIP_MIGRATIONS=1
      shift
      ;;
    --restart-command)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --restart-command" >&2
        exit 1
      fi
      RESTART_COMMAND="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--skip-install] [--skip-migrations] [--restart-command \"systemctl restart ...\"]" >&2
      exit 1
      ;;
  esac
done

run_as_app_user() {
  if [[ "$(id -un)" == "${APP_USER}" ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1 && id "${APP_USER}" >/dev/null 2>&1; then
    sudo -u "${APP_USER}" "$@"
    return
  fi

  "$@"
}

echo "==> Project root: ${PROJECT_ROOT}"
echo "==> Deploy user: ${APP_USER}"

cd "${PROJECT_ROOT}"

if [[ -d "${PROJECT_ROOT}/frontend/web/dist" ]] && [[ "$(id -u)" -eq 0 ]] && id "${APP_USER}" >/dev/null 2>&1; then
  echo "==> Fixing frontend build ownership"
  chown -R "${APP_USER}:${APP_USER}" "${PROJECT_ROOT}/frontend/web/dist"
fi

if [[ "${SKIP_INSTALL}" -eq 0 ]]; then
  echo "==> Installing workspace dependencies"
  run_as_app_user npm install
else
  echo "==> Skipping npm install"
fi

echo "==> Building workspaces"
run_as_app_user npm run build

if [[ "${SKIP_MIGRATIONS}" -eq 0 ]]; then
  echo "==> Applying database migrations"
  run_as_app_user npm run dev:db:migrate
else
  echo "==> Skipping database migrations"
fi

if [[ -n "${RESTART_COMMAND}" ]]; then
  echo "==> Running restart command"
  bash -lc "${RESTART_COMMAND}"
else
  cat <<EOF
==> Deploy steps finished.

Next restart step:
  No restart command was configured.

Examples:
  CMS_RESTART_COMMAND="systemctl restart cmsfleet-api cmsfleet-web" ./scripts/deploy-linux.sh
  ./scripts/deploy-linux.sh --restart-command "systemctl restart cmsfleet-api"

Manual API restart example:
  cd ${PROJECT_ROOT}/backend/api
  sudo -u ${APP_USER} node dist/index.js
EOF
fi

echo "==> Done"
