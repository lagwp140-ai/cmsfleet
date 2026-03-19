# Module Boundaries

## Monorepo Boundaries

- `frontend/*` may depend on browser-safe packages and backend contracts, but never on database code.
- `backend/api` owns public HTTP contracts, auth, validation, persistence orchestration, and the canonical SQL migration set under `backend/api/db`.
- `backend/config-runtime` owns runtime configuration loading, deep merging, and schema validation for Node services.
- `services/*` may reuse backend runtime libraries, but should not expose user-facing APIs by default.
- `java-services/*` are isolated runtimes with their own build lifecycle and explicit integration contracts.
- `config/*` stores technical defaults and deployment configuration data, but not executable business logic.

## Backend API Module Shape

Each backend domain should live under `src/modules/<domain>` and normally contain:

- `routes`: HTTP route registration
- `service`: business logic and orchestration
- `repository`: PostgreSQL access
- `schemas`: input and output validation
- `types`: domain-specific interfaces when needed

## Ownership Rules

- Authentication and authorization stay in the API layer.
- Database access stays behind repositories or query services.
- Background processing logic stays in workers or job handlers, not in controllers.
- Deployment-specific behavior should be expressed through configuration profiles before introducing code forks.
- GTFS parsing, graph generation, and route computation stay out of the main Node.js API unless there is a strong operational reason to keep them there.

## Integration Rules

- The frontend communicates with the backend API, not directly with PostgreSQL or worker services.
- Workers communicate through the database, queue infrastructure, or explicitly versioned internal APIs.
- Java services integrate through narrow contracts such as imported files, job tables, or service APIs.
- Node services load the same deployment configuration so transport, branding, and hardware assumptions stay consistent across the stack.
