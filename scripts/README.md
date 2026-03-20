# Scripts

Repository-level utility scripts live here.

## Local Development

The repo now includes a cross-platform local development toolchain:

- `dev-setup.ts`: copies missing `.env` files from the repo templates.
- `dev-runner.ts`: starts the API, frontend, and worker together with prefixed logs.
- `run-db-migrations.ts`: applies ordered SQL migrations directly through PostgreSQL without requiring `psql`.
- `seed-local-dev.ts`: loads demo routes, trips, stops, vehicles, and a GTFS dataset for local work.
- `mock-gps-sender.ts`: sends repeatable HTTP GPS payloads for the seeded demo vehicles.
- `mock-display-console.ts`: logs into the admin API, publishes mock LED commands, and watches adapter status.

## Current Utilities

- [bootstrap.ps1](/c:/Projects/cmsfleet/scripts/bootstrap.ps1): checks a developer machine for the main local prerequisites.
- [apply-db-migrations.ps1](/c:/Projects/cmsfleet/scripts/apply-db-migrations.ps1): applies ordered `.up.sql` or `.down.sql` files with `psql` using `CMS_DATABASE_URL`.
- [run-db-migrations.ts](/c:/Projects/cmsfleet/scripts/run-db-migrations.ts): applies ordered migrations through the `pg` driver for local development.
- [deploy-linux.sh](/c:/Projects/cmsfleet/scripts/deploy-linux.sh): post-`git pull` Linux deploy helper that installs dependencies, builds, runs migrations, and can optionally run a restart command.
- [seed-local-dev.ts](/c:/Projects/cmsfleet/scripts/seed-local-dev.ts): provisions demo fleet and GTFS seed data.
- [mock-gps-sender.ts](/c:/Projects/cmsfleet/scripts/mock-gps-sender.ts): simulates live GPS updates.
- [mock-display-console.ts](/c:/Projects/cmsfleet/scripts/mock-display-console.ts): interacts with the mock display adapter through the real API.

## Linux Deploy Helper

After `git pull` on Linux:

```bash
cd /opt/bucms/app
chmod +x scripts/deploy-linux.sh
./scripts/deploy-linux.sh
```

Optional restart integration:

```bash
CMS_RESTART_COMMAND="systemctl restart cmsfleet-api" ./scripts/deploy-linux.sh
```

Optional flags:

- `--skip-install`
- `--skip-migrations`
- `--restart-command "systemctl restart cmsfleet-api"`

