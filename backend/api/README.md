# Backend API

Primary Node.js API for the CMS platform.

## Responsibilities

- Authentication and authorization boundaries
- CRUD workflows for content, routes, stops, and fleet-facing configuration
- Validation of inbound requests
- Transactional persistence to PostgreSQL
- Emission of async work for long-running tasks

## Configuration Model

The API boots from the shared `@cmsfleet/config-runtime` package. Deployment differences such as transport rules, branding, GPS providers, LED mappings, and feature flags are resolved from JSON profiles and environment overrides before the server starts.