# Deploy

Deployment manifests, local orchestration files, and environment overlays belong here.

## Local Development Stack

- `docker-compose.dev.yml`: local PostgreSQL plus Adminer for day-to-day development.
- `docker-compose.test.yml`: isolated PostgreSQL instance for test execution.

Default local ports:

- PostgreSQL: `5432`
- Adminer: `8080`
- Test PostgreSQL: `5434`

Recommended local database bootstrap:

1. `npm run dev:stack:up`
2. `npm run dev:db:migrate`
3. `npm run dev:seed`

After the stack is up, open Adminer at `http://localhost:8080` and connect with the PostgreSQL values from the repo `.env` file.

Add production deployment manifests later based on the chosen platform such as Kubernetes, ECS, or VM-based deployment.

## Ubuntu Production Layout

Production-oriented Ubuntu 22.04+ deployment assets now live under [deploy/ubuntu](/c:/Projects/cmsfleet/deploy/ubuntu/README.md), including:

- systemd service and timer units
- Nginx reverse-proxy configuration
- environment file templates
- build and deploy shell scripts
- PostgreSQL and configuration backup scripts
- logrotate policy for application log files
