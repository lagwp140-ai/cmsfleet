# GTFS Processor

Reserved Java service for GTFS import and route-computation support.

## Suggested Responsibilities

- Validate raw GTFS bundles
- Normalize or enrich schedule data
- Build route or stop artifacts for downstream services
- Generate graph data when routing logic becomes complex enough to justify it

## Integration Guidance

Keep the integration contract narrow: accept files or jobs, produce artifacts, and publish status back through explicit storage or API boundaries.