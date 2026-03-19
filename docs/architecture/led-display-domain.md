# LED Display Domain Model

## Intent

The LED display layer should stay independent from route-resolution and transport-specific business logic. The CMS core decides display intent, message mode, and rendering templates first. Vendor or controller-specific drivers translate that intent into physical protocol commands later.

## Core Model

The display domain now centers on a profile-driven model with these concepts:

- display profile
- message format
- rendering templates per surface
- route display mode
- destination display mode
- service message mode
- emergency override mode
- preview mode
- structured display command payloads for panel drivers
- adapter health and delivery queue state

The active runtime contract lives in the shared configuration model and is exposed through the backend display module.

## Runtime Contract

Display profiles now define:

- `messageFormat` for line count, character limits, and encoding
- `controllerContract` for abstract driver capabilities and supported operations
- `templates` for `route`, `destination`, `serviceMessage`, `emergency`, and `preview`
- mode-specific policy objects for route, destination, service-message, emergency, and preview behavior

This keeps mode behavior deployable through config rather than code forks.

## Backend Abstraction

The backend display module now exposes five responsibilities:

- return the active display domain model for the admin console
- render preview scenarios into an abstract publish envelope
- generate structured panel command payloads for front, side, rear, and optional interior displays
- queue publish requests for delivery through a hardware adapter boundary
- report delivery history, retry state, and adapter health

The command generator accepts live vehicle context plus request-time overrides and produces:

- route number and destination commands
- alternating message frames
- stop announcement text commands
- service message commands
- emergency override commands
- test-pattern commands

## Adapter Boundary

The command payload is intentionally protocol-neutral. It carries:

- target provider and transport family
- system status
- one command per display panel
- frame timing for static or alternating content
- supported operations like `publish`, `preview`, `clear`, and `set_brightness`

A `DisplayHardwareAdapter` boundary sits after command generation. Adapters receive queued delivery requests rather than route-resolution state directly. That keeps Hanover, Luminator, or future controller integrations isolated from CMS transport logic.

The current runtime includes:

- a common adapter interface for delivery and health checks
- a mock adapter for development and integration testing
- a queueing service with retry handling and retained delivery history
- admin endpoints for publish, queue status, and delivery inspection

## Queue and Retry Model

Display publish requests now move through these delivery states:

- `queued`
- `processing`
- `retry_waiting`
- `delivered`
- `failed`

Retries are handled in-process with bounded attempts and scheduled backoff. Delivery history records:

- adapter id and mode
- attempt count
- last attempt time
- next retry time
- adapter message id when accepted
- final error message when delivery fails

This is enough for the MVP and mock-hardware development. A later production adapter can move queue persistence into PostgreSQL or a worker without changing the transport-facing command model.

## Preview Safety

Preview mode uses sample values from the display profile and renders the same template model operators will later publish. That keeps preview logic close to production intent while remaining safe for staging, testing, and operator review.
