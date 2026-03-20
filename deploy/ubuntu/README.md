# Ubuntu Deployment

This directory contains a production-oriented deployment layout for Ubuntu 22.04+.

## Structure

- `env/`: environment file templates for the backend API and integration worker.
- `nginx/`: reverse-proxy configuration for the frontend and API.
- `systemd/`: service and timer units.
- `scripts/`: build, deploy, installation, and backup automation.
- `logrotate/`: file-log retention policy for `/var/log/cmsfleet`.

## Recommended Host Layout

- app root: `/opt/cmsfleet/current`
- environment files: `/etc/cmsfleet/*.env`
- frontend static files: `/var/www/cmsfleet`
- application logs: `/var/log/cmsfleet`
- backups: `/var/backups/cmsfleet`

## Runtime Services

- `cmsfleet-api.service`
- `cmsfleet-worker.service`
- `cmsfleet-backup.service`
- `cmsfleet-backup.timer`

## Deployment Flow

1. Copy the repo to the target host or make it available to the deploy script.
2. Copy the env templates from `env/` into `/etc/cmsfleet/` and replace the placeholder secrets.
3. Run `deploy/ubuntu/scripts/install-systemd.sh`.
4. Run `deploy/ubuntu/scripts/install-nginx.sh`.
5. Run `deploy/ubuntu/scripts/deploy-release.sh /path/to/repo`.

## Log Conventions

Systemd units append file logs under `/var/log/cmsfleet`:

- `backend-api.log`
- `backend-api-error.log`
- `integration-worker.log`
- `integration-worker-error.log`
- `backup.log`
- `backup-error.log`

The provided logrotate policy keeps 14 daily rotations and compresses old files.

## Backups

The backup service runs both:

- PostgreSQL dumps in `/var/backups/cmsfleet/postgres`
- config and env archives in `/var/backups/cmsfleet/config`

The timer is scheduled nightly at `02:15` and can also be triggered manually with `systemctl start cmsfleet-backup.service`.