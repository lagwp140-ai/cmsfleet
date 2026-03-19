# Integration Worker

Node.js worker for asynchronous platform jobs.

## Responsibilities

- Poll external feed providers
- Run scheduled synchronization tasks
- Process publish or notification jobs
- Perform retryable work outside request-response flows

## Configuration Model

The worker uses the shared configuration runtime and reads the same deployment profiles as the API. This keeps transport-specific GPS, GTFS, display, and feature settings aligned across services.