# Config Runtime

Shared configuration loader for Node.js services in the monorepo.

## Responsibilities

- Locate deployment JSON files under `config/cms`
- Merge base config, environment overrides, and selected profiles
- Apply override files and environment-variable overrides
- Validate the final configuration with JSON Schema
- Fail fast before service startup when configuration is invalid

## Loading Order

1. `config/cms/base.json`
2. `config/cms/environments/<env>.json`
3. selected tenant, transport, vehicle, device, and display profiles
4. optional override files from `CMS_CONFIG_OVERRIDES`
5. typed runtime overrides from environment variables
6. path-based overrides from `CMS_CFG__...`