# CMS Runtime Configuration

This folder contains deployment-specific runtime configuration for the CMS core.

## Layering Order

1. `base.json`
2. `environments/<env>.json`
3. selected profile files
4. optional override files from `CMS_CONFIG_OVERRIDES`
5. typed environment variable overrides such as `CMS_DATABASE_URL`
6. deep path overrides using `CMS_CFG__...`

## Config Areas

- `auth`: session settings, password policy, and role permissions
- `tenants/`: branding, locale, and tenant-specific feature defaults
- `transport-profiles/`: transport mode, route strategy, GTFS, and GPS defaults
- `vehicle-profiles/`: vehicle class and capacity settings
- `device-profiles/`: onboard compute and connectivity traits
- `display-profiles/`: LED controller settings, abstract display modes, rendering templates, preview samples, and future driver capabilities

## Environment Variable Support

Use the selection variables to choose profile IDs:

- `CMS_CONFIG_ENV`
- `CMS_CONFIG_TENANT_PROFILE`
- `CMS_CONFIG_TRANSPORT_PROFILE`
- `CMS_CONFIG_VEHICLE_PROFILE`
- `CMS_CONFIG_DEVICE_PROFILE`
- `CMS_CONFIG_DISPLAY_PROFILE`

Use typed auth overrides for operational secrets and cookie settings:

- `CMS_AUTH_SESSION_SECRET`
- `CMS_AUTH_COOKIE_NAME`
- `CMS_AUTH_SESSION_MAX_AGE_MINUTES`
- `CMS_AUTH_PASSWORD_MIN_LENGTH`
- `CMS_AUTH_PASSWORD_ITERATIONS`
- `CMS_AUTH_SECURE_COOKIES`

Use `CMS_CFG__` overrides for arbitrary config paths. Example:

```text
CMS_CFG__feature_flags__advanced_head_sign_rules=true
CMS_CFG__branding__application_name=Kyiv Fleet CMS
```

The loader normalizes underscore-separated segments into camelCase.
