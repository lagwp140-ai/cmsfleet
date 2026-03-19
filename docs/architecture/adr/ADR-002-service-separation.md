# ADR-002: Service Separation by Runtime Responsibility

- Status: Accepted
- Date: 2026-03-18

## Context

The platform must support low-latency API traffic, operational background jobs, and potentially compute-heavy GTFS processing. Mixing those concerns too early would create scaling and reliability problems.

## Decision

- Use Node.js for the main API and operational background workers.
- Reserve Java services for GTFS processing, route graph generation, or other transit algorithms that benefit from Java tooling or performance characteristics.
- Keep PostgreSQL as the primary system of record.

## Consequences

- The API can stay focused on business transactions and operator-facing features.
- Background jobs can scale independently from HTTP traffic.
- Java can be introduced only where it provides a real benefit instead of becoming the default runtime.
- Cross-runtime contracts must be explicit and documented.