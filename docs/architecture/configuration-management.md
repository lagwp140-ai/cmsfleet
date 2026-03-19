# Configuration Management Module

## Purpose

The configuration management module exposes deployment-scoped JSON files as controlled admin-managed resources without turning runtime configuration into ad hoc database state.

## Editable Scopes

The current implementation manages the active files for these scopes:

- `global`: `config/cms/environments/<env>.json`
- `tenant`: `config/cms/tenants/<tenant>.json`
- `transport`: `config/cms/transport-profiles/<transport>.json`
- `display`: `config/cms/display-profiles/<display>.json`

These scopes cover the main deployment-specific areas requested for the CMS:

- transport and route strategy
- GPS settings
- display mappings and templates
- branding
- feature flags
- environment overrides

## Apply Flow

1. The admin UI loads the active scope file and recent version history.
2. An operator edits the JSON document directly.
3. Validation stages the candidate file in a temporary config tree.
4. The staged tree is loaded through the same config runtime used at backend startup.
5. If validation passes, the real file is updated on disk and a new `config.config_versions` record is written.

## Versioning and Rollback

Each scope write creates a new active snapshot in `config.config_versions`.
If files are changed outside the CMS, the module synchronizes the active snapshot when the scope is read.
Rollback restores an earlier payload by writing it back to the file and recording that restore as a fresh version.

## Runtime Behavior

Configuration edits are persisted safely to disk and versioned immediately, but the backend still uses the configuration loaded at process startup.
The UI therefore surfaces whether the on-disk configuration is still in sync with the running process or whether a restart/reload is required.