# Configuration Strategy

## Principles

- Store runtime deployment data in [`config/cms`](/c:/Projects/cmsfleet/config/cms/README.md) and executable loading logic in [`backend/config-runtime`](/c:/Projects/cmsfleet/backend/config-runtime/README.md).
- Treat environment variables as the source of environment-specific values and last-mile overrides.
- Validate final merged config at startup for every service.
- Keep secrets out of the repository; commit only `.env.example` templates.

## Layout

- Root `.env.example`: local orchestration defaults, auth secrets, and profile selection examples.
- Service `.env.example` files: service-specific runtime overrides.
- `config/cms/base.json`: shared CMS defaults, auth policy, and RBAC definitions.
- `config/cms/environments`: per-environment JSON overrides.
- `config/cms/*-profiles`: transport, vehicle, device, display, and tenant variations.
- `config/cms/schemas`: JSON Schema definitions for fail-fast validation.
- `config/tsconfig`, `config/eslint`, `config/prettier`: shared technical baselines.

## Override Order

1. Base config
2. Environment override file
3. Selected profiles
4. Optional override files
5. Typed env overrides
6. `CMS_CFG__...` deep-path env overrides

## Runtime Guidance

- Services should read deployment config through the shared loader, not ad hoc JSON parsing.
- Prefer adding fields to profiles or auth policy over creating tenant-specific conditionals in code.
- Use typed env vars for common operational values and secrets, and `CMS_CFG__...` only for exceptional overrides.
- Add new config knobs only when they represent a real deployment concern.

## Secrets

- Use a secret manager in deployed environments.
- Do not mirror production secrets in local `.env` files.
- Keep `.env.example` values obviously fake and safe.
- Fail fast when non-local deployments keep the local session-secret placeholder or enable bootstrap users.
- Require secure auth cookies in production.
