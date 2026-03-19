import type { GtfsValidationIssue, ParsedGtfsFeed } from "./types.js";

export function validateParsedGtfsFeed(feed: ParsedGtfsFeed): GtfsValidationIssue[] {
  const issues: GtfsValidationIssue[] = [];
  const routeIds = new Set<string>();
  const stopIds = new Set<string>();
  const tripIds = new Set<string>();
  const calendarServiceIds = new Set<string>();
  const calendarDateServiceIds = new Set<string>();

  for (const route of feed.routes) {
    if (routeIds.has(route.externalRouteId)) {
      issues.push(issue("routes.txt", route.rowNumber, null, route.externalRouteId, `Duplicate route_id ${route.externalRouteId}.`, route.rawRow));
      continue;
    }

    routeIds.add(route.externalRouteId);
  }

  for (const calendar of feed.serviceCalendars) {
    if (calendarServiceIds.has(calendar.serviceId)) {
      issues.push(issue("calendar.txt", calendar.rowNumber, null, calendar.serviceId, `Duplicate service_id ${calendar.serviceId} in calendar.txt.`, calendar.rawRow));
      continue;
    }

    calendarServiceIds.add(calendar.serviceId);
  }

  for (const exception of feed.serviceCalendarDates) {
    calendarDateServiceIds.add(exception.serviceId);
  }

  for (const stop of feed.stops) {
    if (stopIds.has(stop.externalStopId)) {
      issues.push(issue("stops.txt", stop.rowNumber, null, stop.externalStopId, `Duplicate stop_id ${stop.externalStopId}.`, stop.rawRow));
      continue;
    }

    stopIds.add(stop.externalStopId);
  }

  const hasScheduleDefinitions = calendarServiceIds.size > 0 || calendarDateServiceIds.size > 0;

  for (const trip of feed.trips) {
    if (!routeIds.has(trip.routeExternalId)) {
      issues.push(issue("trips.txt", trip.rowNumber, "route_id", trip.externalTripId, `Trip references unknown route_id ${trip.routeExternalId}.`, trip.rawRow));
    }

    if (tripIds.has(trip.externalTripId)) {
      issues.push(issue("trips.txt", trip.rowNumber, null, trip.externalTripId, `Duplicate trip_id ${trip.externalTripId}.`, trip.rawRow));
      continue;
    }

    if (hasScheduleDefinitions && !calendarServiceIds.has(trip.serviceId) && !calendarDateServiceIds.has(trip.serviceId)) {
      issues.push(issue("trips.txt", trip.rowNumber, "service_id", trip.externalTripId, `Trip references unknown service_id ${trip.serviceId}.`, trip.rawRow));
    }

    tripIds.add(trip.externalTripId);
  }

  for (const stop of feed.stops) {
    if (stop.parentExternalStopId && !stopIds.has(stop.parentExternalStopId)) {
      issues.push(issue("stops.txt", stop.rowNumber, "parent_station", stop.externalStopId, `Stop references unknown parent_station ${stop.parentExternalStopId}.`, stop.rawRow));
    }
  }

  const stopSequenceByTrip = new Map<string, number>();

  for (const stopTime of feed.stopTimes) {
    if (!tripIds.has(stopTime.tripExternalId)) {
      issues.push(issue("stop_times.txt", stopTime.rowNumber, "trip_id", stopTime.tripExternalId, `Stop time references unknown trip_id ${stopTime.tripExternalId}.`, stopTime.rawRow));
    }

    if (!stopIds.has(stopTime.externalStopId)) {
      issues.push(issue("stop_times.txt", stopTime.rowNumber, "stop_id", stopTime.tripExternalId, `Stop time references unknown stop_id ${stopTime.externalStopId}.`, stopTime.rawRow));
    }

    if (stopTime.departureOffsetSeconds < stopTime.arrivalOffsetSeconds) {
      issues.push(issue("stop_times.txt", stopTime.rowNumber, "departure_time", stopTime.tripExternalId, "departure_time must be greater than or equal to arrival_time.", stopTime.rawRow));
    }

    const previousSequence = stopSequenceByTrip.get(stopTime.tripExternalId);

    if (previousSequence !== undefined && stopTime.stopSequence <= previousSequence) {
      issues.push(issue("stop_times.txt", stopTime.rowNumber, "stop_sequence", stopTime.tripExternalId, "stop_sequence must increase within each trip.", stopTime.rawRow));
    }

    stopSequenceByTrip.set(stopTime.tripExternalId, stopTime.stopSequence);
  }

  return issues;
}

function issue(
  fileName: string,
  rowNumber: number,
  fieldName: string | null,
  entityKey: string,
  message: string,
  rawRow: Record<string, unknown>
): GtfsValidationIssue {
  return {
    entityKey,
    fieldName,
    fileName,
    message,
    rawRow,
    rowNumber,
    severity: "error"
  };
}
