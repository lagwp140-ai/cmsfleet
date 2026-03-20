# Production Observability

The CMS now exposes a shared observability layer designed to support both human operators and external monitoring systems.

## Endpoints

- `GET /health/live`
  Returns a lightweight liveness snapshot for process-level checks.
- `GET /health/ready`
  Returns aggregated readiness with dependency and subsystem health. Responds with `503` when a required dependency is not ready.
- `GET /health`
  Returns the full component overview, uptime, runtime details, and summarized request metrics.
- `GET /metrics`
  Returns Prometheus-style text metrics for infrastructure scrapers.
- `GET /api/admin/observability/overview`
  Returns a protected admin overview including component status plus recent `error` and `critical` system events.

## Component Coverage

The shared registry currently reports on:

- API process health and uptime
- PostgreSQL connectivity and pool pressure
- GPS ingestion freshness and fleet connectivity posture
- GTFS dataset/import health and latest job state
- display adapter health, queue depth, retries, and failures
- recent high-severity system events

## Structured Logging

The API now emits structured request-completion logs with:

- request id
- method
- route pattern
- client IP
- status code
- duration in milliseconds

Subsystem services continue to emit domain logs, and the observability registry raises structured alert events when a component enters a `warn` or `fail` state.

## Metrics

The `/metrics` output includes:

- process uptime and memory gauges
- HTTP request counters and duration sums by route/method/status class
- database pool gauges and latency
- GTFS, GPS, display, and alert counters
- component readiness and status gauges

This is intentionally dependency-free so it can be scraped immediately and extended later without replacing the transport contract.

## Alert Hooks

The observability registry now supports alert sinks. The current default sink writes structured warn/error alert events to the API logger whenever a component transitions into a degraded or failed state.

Future integrations can add:

- webhook sinks
- PagerDuty or Opsgenie sinks
- message-bus sinks
- persistent alert history

without changing the subsystem modules that report health.

## Operational Notes

- Database failure marks readiness as failed.
- GTFS, GPS, display, and recent-system-event issues currently degrade component health without making the whole API unready.
- The metrics endpoint is unauthenticated for scraper compatibility and should be network-restricted at the reverse proxy or firewall layer in production.
