# Local Development

## Objectives

Local development should let a new teammate bring up the CMS with a real PostgreSQL database, demo fleet data, mock GPS traffic, and the mock LED display adapter without needing production infrastructure.

## Local Stack

The local stack is intentionally lightweight:

- PostgreSQL in Docker for the canonical relational model
- Adminer in Docker for quick schema and data inspection
- Fastify backend on the host machine
- Vite frontend on the host machine
- integration worker placeholder on the host machine
- mock GPS sender as an opt-in host-side utility
- mock LED display tooling that talks to the real admin API

## Provisioning Flow

Recommended setup sequence:

1. `npm install`
2. `npm run dev:setup`
3. `npm run dev:stack:up`
4. `npm run dev:db:migrate`
5. `npm run dev:seed`
6. `npm run dev:start`

Optional traffic simulation:

- `npm run dev:gps:send`
- `npm run dev:display:watch`
- `npm run dev:display:publish -- --vehicle-id BUS-100 --message "Detour active"`

## Seeded Demo Data

The local seed script provisions:

- one active GTFS dataset named `demo-city-local-seed`
- two demo routes: `24` and `A1`
- stops and stop times for both routes
- three vehicles: `BUS-100`, `BUS-101`, and `BUS-A1`
- synced device and display profile catalogs from `config/cms`

This is enough to exercise:

- login and RBAC
- fleet administration
- route resolution
- GPS ingestion and freshness logic
- display command generation and mock adapter delivery
- diagnostics and operations dashboard views

## Mock Services

### GPS

`mock-gps-sender.ts` posts directly to `POST /api/ingest/gps/http` using the seeded vehicle codes. It can run once or in a loop and is useful for checking:

- online and offline transitions
- operational dashboard freshness widgets
- route state context on vehicles that already have manual or scheduled data

### LED displays

The backend already uses the mock display adapter factory in local development. `mock-display-console.ts` provides a thin operator utility around that API so developers can:

- inspect queue and adapter health
- publish a service message or test pattern
- watch deliveries move through the queue

## Local Credentials

When `CMS_AUTH_BOOTSTRAP_USERS_ENABLED=true`, the local bootstrap users are available for the seeded environment.

Default development login:

- email: `admin@demo-city.local`
- password: `Transit!Demo2026`

These credentials are for local development only and should never be reused outside the local profile.