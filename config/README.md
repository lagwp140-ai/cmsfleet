# Shared Config

This folder now contains both shared technical defaults and runtime deployment data.

## Current Areas

- `cms/`: configuration-first deployment data and JSON Schema definitions
- `eslint/`: flat-config lint baselines
- `prettier/`: formatting defaults
- `tsconfig/`: TypeScript compiler baselines for Node services and frontend apps

## Rules

- Keep executable configuration logic out of this folder; that belongs in `backend/config-runtime`.
- Store deployment differences in JSON here so services can share one CMS core.
- Favor stable defaults over package-specific tweaks.
- Package-local config may extend these files when a runtime truly differs.