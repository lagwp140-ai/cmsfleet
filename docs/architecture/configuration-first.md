# Configuration-First Architecture

## Intent

The CMS core should be reusable across different bus operators, vehicle fleets, and onboard hardware. Differences must live in configuration rather than conditional branches scattered across the codebase.

## Layering Model

The configuration loader resolves runtime settings in this order:

1. `config/cms/base.json`
2. `config/cms/environments/<env>.json`
3. selected profile files for tenant, transport, vehicle, device, and display
4. optional override files from `CMS_CONFIG_OVERRIDES`
5. typed environment variable overrides such as `CMS_DATABASE_URL`
6. deep env overrides using the `CMS_CFG__...` prefix

Later layers win.

## Profile Responsibilities

- Tenant profiles own branding, locale, tenant identity, and tenant-level feature defaults.
- Transport profiles own route strategy, GTFS settings, and GPS provider defaults.
- Vehicle profiles own class, capacity, and accessibility defaults.
- Device profiles own onboard compute and connectivity capabilities.
- Display profiles own LED mapping rules and controller-specific settings.

## Fail-Fast Behavior

Node services call the shared configuration runtime before they bind ports or start worker loops. If any JSON file is missing, malformed, or fails schema validation, startup aborts immediately.

## Extension Rules

- Add new deployment differences as config fields before adding code branches.
- Extend schemas and sample profiles in the same change.
- Avoid tenant-specific logic in service code when a profile can express the behavior instead.