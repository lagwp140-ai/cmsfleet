# Route Resolution Engine

## Scope

The route resolution engine determines what service a vehicle is operating right now from the safest signals available in rollout order:

1. manual route assignment on the vehicle record
2. GTFS schedule-assisted trip selection on that route
3. GPS-assisted automatic trip matching later

The current implementation lives in [`backend/api/src/modules/routes`](/c:/Projects/cmsfleet/backend/api/src/modules/routes/module.ts) and is surfaced in [`frontend/web/src/pages/RoutesPage.tsx`](/c:/Projects/cmsfleet/frontend/web/src/pages/RoutesPage.tsx).

## Current Decision Model

- If a vehicle is disabled or not operationally active, the resolver marks it as `inactive_vehicle` and does not push it through live trip selection.
- If `routeOverrideMode` is `manual`, the resolver treats the pinned route as the authoritative route context.
- Once a manual route is known, the resolver uses GTFS `calendar.txt`, `calendar_dates.txt`, `trips.txt`, and `stop_times.txt` to select the best current or upcoming trip for the local GTFS service day.
- If no matching trip is found for that route, the resolver falls back to `manual_route_only` rather than inventing a trip.
- If the vehicle is in auto mode, the resolver currently returns `awaiting_auto_match` until the later GPS-assisted matching phase is added.

## Output Per Vehicle

The resolver stores and returns:

- active route
- active or upcoming trip
- direction
- next stop candidate
- service date
- route state
- resolution source
- evaluation metadata and timestamp

The latest per-vehicle snapshot is persisted in `operations.vehicle_route_resolutions` so the admin UI and later workers can read one record per bus instead of recalculating from raw GTFS tables every time.

## GTFS Service-Day Support

Schedule-assisted selection depends on versioned GTFS calendar data:

- `transit.service_calendars` stores weekly service patterns and date ranges
- `transit.service_calendar_dates` stores additions and removals for specific service dates
- the resolver evaluates both the current local service day and the previous one so trips after midnight that use `25:xx:xx` style times can still be matched correctly

## Stability Notes

- Manual route overrides are remapped through the route's stable GTFS identity when a new GTFS dataset is activated, so dispatch intent survives dataset swaps.
- The current engine is manual-first on purpose. It will not guess a route in auto mode without a later GPS-assisted matcher.
- GPS-assisted matching should plug in as another strategy step, not as a rewrite of the schedule and persistence model.
