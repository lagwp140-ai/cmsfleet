# Deploy

Deployment manifests, local orchestration files, and environment overlays belong here.

## Current Assets

- `docker-compose.dev.yml`: local PostgreSQL bootstrap for development

Add production deployment manifests later based on the chosen platform such as Kubernetes, ECS, or VM-based deployment.

After starting local PostgreSQL, apply the ordered SQL migrations from [ackend/api/db/migrations](/c:/Projects/cmsfleet/backend/api/db/migrations) before booting API features that expect the canonical relational schema.

