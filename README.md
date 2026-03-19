# cmsfleet

Production-oriented monorepo skeleton for a bus CMS platform.

The repository is organized to keep product-facing concerns, background processing, deployment assets, and architecture decisions in one place without forcing every service into the same runtime. Node.js is the default platform for the API and operational services, PostgreSQL is the system of record, and Java is reserved for compute-heavy GTFS or routing workloads when that tradeoff becomes worthwhile.

## Goals

- Lock architecture and conventions early.
- Keep the main API and frontend simple to extend.
- Separate HTTP, async processing, and specialized compute concerns.
- Make local setup predictable with shared config and env templates.
- Keep deployment differences in configuration instead of branching the core CMS code.

## Repository Layout

```text
.
|-- backend/
|   |-- api/
|   `-- config-runtime/
|-- config/
|   |-- cms/
|   |-- eslint/
|   |-- prettier/
|   `-- tsconfig/
|-- deploy/
|-- docs/
|   |-- architecture/
|   |   `-- adr/
|   `-- conventions/
|-- frontend/
|   `-- web/
|-- java-services/
|   `-- gtfs-processor/
|-- scripts/
|-- services/
|   `-- integration-worker/
`-- tests/
```

## Baseline Technology Choices

- Monorepo tooling: npm workspaces
- Backend API: Node.js + TypeScript + Fastify
- Frontend: React + Vite + TypeScript
- Primary database: PostgreSQL
- Background jobs: Node.js worker services
- Runtime configuration: JSON profiles + environment overrides + JSON Schema validation
- Heavy transit processing: Java services when needed

## Configuration-First Runtime Model

The CMS core stays the same across deployments. Variability moves into versioned configuration layers under [`config/cms`](/c:/Projects/cmsfleet/config/cms/README.md):

- tenant profiles for branding, locale, and tenant defaults
- transport profiles for route strategy, GTFS, and GPS behavior
- vehicle profiles for bus class and onboard capabilities
- device profiles for hardware and connectivity assumptions
- display profiles for LED mappings and controller settings
- environment-specific JSON overrides and env-var overrides for operational differences

All Node.js services load configuration through [`backend/config-runtime`](/c:/Projects/cmsfleet/backend/config-runtime/README.md). Invalid configuration fails startup immediately.

## Authentication and Access Control

The API now ships with a configuration-driven authentication boundary for the admin surface:

- cookie-based server-side sessions for the web app
- PBKDF2-SHA512 password hashing with configurable policy values
- config-defined roles for `super_admin`, `dispatcher`, `operator`, and `viewer`
- protected admin routes with permission checks in both the API and frontend router
- PostgreSQL-backed session state and audit events for sign-in, sign-out, failed login, and password changes
- local-only bootstrap users for development, disabled by policy outside `local`

## Getting Started

1. Install Node.js 22.x, npm 10.x, PostgreSQL 16+, and Java 21.
2. Copy the root and service-level `.env.example` files into real `.env` files.
3. Start PostgreSQL locally or via [`deploy/docker-compose.dev.yml`](/c:/Projects/cmsfleet/deploy/docker-compose.dev.yml).
4. Run `npm install` from the repository root.
5. Validate config resolution with `npm run config:validate`.
6. Start the API with `npm run dev:api` and the frontend with `npm run dev:web`.

## Working Agreements

- Architecture decisions live in [`docs/architecture`](/c:/Projects/cmsfleet/docs/architecture).
- Coding and configuration conventions live in [`docs/conventions`](/c:/Projects/cmsfleet/docs/conventions).
- Runtime deployment data lives in [`config/cms`](/c:/Projects/cmsfleet/config/cms/README.md).
- Shared technical lint and TypeScript settings live in [`config`](/c:/Projects/cmsfleet/config).
- New domains should be added as focused modules, not as generic shared utility buckets.

## Next Implementation Steps

- Add fleet, routes, signage content, and user-management modules on top of the auth boundary.
- Replace boot-time table creation with a formal migration and seed pipeline.
- Surface selected branding and feature flags to the frontend shell beyond the admin screen.
- Add CI to run config validation, lint, typecheck, unit tests, and container validation.
- Define the first GTFS import contract before building the Java service internals.
