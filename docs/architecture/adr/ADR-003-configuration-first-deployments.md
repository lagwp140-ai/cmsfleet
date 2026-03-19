# ADR-003: Configuration-First Deployments

- Status: Accepted
- Date: 2026-03-18

## Context

The CMS platform must support multiple transport deployments, vehicle classes, onboard devices, branding variants, and integration providers without diverging the core Node.js services for each operator.

## Decision

- Introduce a shared Node.js configuration runtime package.
- Store deployment differences in JSON layers under `config/cms`.
- Resolve base config, environment overrides, selected profiles, optional override files, and environment variable overrides into one validated runtime object.
- Validate the final configuration with JSON Schema and fail fast during service startup.

## Consequences

- New transport deployments can reuse the same CMS core with profile changes instead of code forks.
- Operational differences such as GPS, LED mappings, GTFS, and branding are explicit and version-controlled.
- Startup becomes stricter because invalid config blocks service boot, which is preferable to latent runtime errors.
- Schema evolution must be managed carefully as new profile fields are introduced.