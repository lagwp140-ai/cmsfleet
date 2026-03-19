# ADR-001: Monorepo Foundation

- Status: Accepted
- Date: 2026-03-18

## Context

The platform needs an early repository structure that supports a Node.js API, a web frontend, background services, deployment assets, and the possibility of specialized Java services without fragmenting architecture decisions across multiple repositories.

## Decision

Use a single monorepo with npm workspaces for Node.js packages and conventional folders for documentation, deployment, scripts, tests, and Java services.

## Consequences

- Shared linting, TypeScript settings, and onboarding docs have a single home.
- Cross-service refactors remain simpler while the platform is still evolving.
- Java services retain build independence instead of being forced into Node-specific tooling.
- Build orchestration stays intentionally lightweight until scale justifies a tool like Turborepo or Nx.