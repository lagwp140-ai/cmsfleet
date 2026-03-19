import type {
  GpsMovementState,
  GpsOperationalStateExtensions,
  NormalizedGpsMessage,
  OperationalStateUpsertInput,
  StoredOperationalStateRecord
} from "./types.js";

const MAX_DERIVED_SPEED_KPH = 180;
const MIN_DISTANCE_FOR_HEADING_METERS = 15;

interface DerivedValue<T> {
  source: string;
  value: T;
}

interface DeriveOperationalStateInput {
  lastReceivedMessageId: string;
  movementThresholdKph: number;
  normalized: NormalizedGpsMessage;
  previousState: StoredOperationalStateRecord | null;
  vehicleId: string;
}

export function deriveOperationalState(input: DeriveOperationalStateInput): {
  positionApplied: boolean;
  state: OperationalStateUpsertInput;
} {
  const positionApplied = shouldApplyPosition(input.normalized.positionTime, input.previousState?.positionTime ?? null);
  const derivedDelta = resolveDerivedDelta(input.previousState, input.normalized, positionApplied);
  const speed = resolveSpeed(input.previousState, input.normalized, positionApplied, derivedDelta);
  const heading = resolveHeading(input.previousState, input.normalized, positionApplied, derivedDelta.distanceMeters);
  const nextMovementState = positionApplied
    ? classifyMovementState(speed.value, input.movementThresholdKph)
    : input.previousState?.movementState ?? "unknown";

  const currentPosition = positionApplied || !input.previousState
    ? {
        headingDeg: heading.value,
        latitude: input.normalized.latitude,
        longitude: input.normalized.longitude,
        positionTime: input.normalized.positionTime,
        sourceName: input.normalized.sourceName,
        speedKph: speed.value
      }
    : {
        headingDeg: input.previousState.headingDeg,
        latitude: input.previousState.latitude,
        longitude: input.previousState.longitude,
        positionTime: input.previousState.positionTime,
        sourceName: input.previousState.sourceName,
        speedKph: input.previousState.speedKph
      };

  return {
    positionApplied,
    state: {
      vehicleId: input.vehicleId,
      lastReceivedMessageId: input.lastReceivedMessageId,
      lastPositionMessageId: positionApplied ? input.lastReceivedMessageId : input.previousState?.lastPositionMessageId ?? null,
      lastSeenAt: maxTimestamp(input.previousState?.lastSeenAt ?? null, input.normalized.receivedAt),
      positionTime: currentPosition.positionTime,
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
      speedKph: currentPosition.speedKph,
      headingDeg: currentPosition.headingDeg,
      movementState: nextMovementState,
      sourceName: currentPosition.sourceName,
      processingMetadata: {
        distanceFromPreviousMeters: derivedDelta.distanceMeters,
        geofenceStatus: "not_configured",
        headingSource: heading.source,
        positionApplied,
        receivedLatencySeconds: calculateLatencySeconds(input.normalized.positionTime, input.normalized.receivedAt),
        routeProximityStatus: "not_configured",
        speedSource: speed.source,
        stopProximityStatus: "not_configured",
        tripProgressStatus: "not_configured"
      },
      extensions: buildExtensions(input.previousState?.extensions)
    }
  };
}

export function classifyMovementState(speedKph: number | null, movementThresholdKph: number): GpsMovementState {
  if (speedKph === null) {
    return "unknown";
  }

  return speedKph >= movementThresholdKph ? "moving" : "stopped";
}

function buildExtensions(previous: GpsOperationalStateExtensions | null | undefined): GpsOperationalStateExtensions {
  return {
    geofence: previous?.geofence ?? null,
    routeProximity: previous?.routeProximity ?? null,
    stopProximity: previous?.stopProximity ?? null,
    tripProgress: previous?.tripProgress ?? null
  };
}

function calculateBearingDegrees(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number {
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLon = toRadians(longitudeB - longitudeA);

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const bearing = Math.atan2(y, x) * (180 / Math.PI);

  return normalizeHeading(bearing);
}

function calculateDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number {
  const earthRadiusMeters = 6_371_000;
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLon = toRadians(longitudeB - longitudeA);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function calculateLatencySeconds(positionTime: string, receivedAt: string): number {
  const positionTimeMs = Date.parse(positionTime);
  const receivedAtMs = Date.parse(receivedAt);

  if (Number.isNaN(positionTimeMs) || Number.isNaN(receivedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((receivedAtMs - positionTimeMs) / 1000));
}

function calculateSpeedKph(distanceMeters: number, elapsedSeconds: number): number | null {
  if (elapsedSeconds <= 0) {
    return null;
  }

  const derivedSpeed = (distanceMeters / elapsedSeconds) * 3.6;

  if (!Number.isFinite(derivedSpeed) || derivedSpeed < 0 || derivedSpeed > MAX_DERIVED_SPEED_KPH) {
    return null;
  }

  return roundValue(derivedSpeed, 2);
}

function isTimestampEqualOrNewer(candidateTimestamp: string, previousTimestamp: string): boolean {
  const candidateTime = Date.parse(candidateTimestamp);
  const previousTime = Date.parse(previousTimestamp);

  if (Number.isNaN(candidateTime)) {
    return false;
  }

  if (Number.isNaN(previousTime)) {
    return true;
  }

  return candidateTime >= previousTime;
}

function maxTimestamp(left: string | null, right: string): string {
  if (!left) {
    return right;
  }

  return isTimestampEqualOrNewer(right, left) ? right : left;
}

function normalizeHeading(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return roundValue(normalized, 2);
}

function resolveDerivedDelta(
  previousState: StoredOperationalStateRecord | null,
  normalized: NormalizedGpsMessage,
  positionApplied: boolean
): { distanceMeters: number | null; elapsedSeconds: number | null } {
  if (!previousState || !positionApplied) {
    return { distanceMeters: null, elapsedSeconds: null };
  }

  const previousTimeMs = Date.parse(previousState.positionTime);
  const nextTimeMs = Date.parse(normalized.positionTime);

  if (Number.isNaN(previousTimeMs) || Number.isNaN(nextTimeMs)) {
    return { distanceMeters: null, elapsedSeconds: null };
  }

  return {
    distanceMeters: roundValue(
      calculateDistanceMeters(previousState.latitude, previousState.longitude, normalized.latitude, normalized.longitude),
      1
    ),
    elapsedSeconds: Math.max(0, Math.floor((nextTimeMs - previousTimeMs) / 1000))
  };
}

function resolveHeading(
  previousState: StoredOperationalStateRecord | null,
  normalized: NormalizedGpsMessage,
  positionApplied: boolean,
  distanceMeters: number | null
): DerivedValue<number | null> {
  if (!positionApplied && previousState) {
    return {
      source: "retained_previous_snapshot",
      value: previousState.headingDeg
    };
  }

  if (normalized.headingDeg !== null) {
    return {
      source: "payload",
      value: normalized.headingDeg
    };
  }

  if (previousState && distanceMeters !== null && distanceMeters >= MIN_DISTANCE_FOR_HEADING_METERS) {
    return {
      source: "derived_bearing",
      value: calculateBearingDegrees(previousState.latitude, previousState.longitude, normalized.latitude, normalized.longitude)
    };
  }

  if (previousState?.headingDeg !== null && previousState?.headingDeg !== undefined) {
    return {
      source: "retained_previous_heading",
      value: previousState.headingDeg
    };
  }

  return {
    source: "unknown",
    value: null
  };
}

function resolveSpeed(
  previousState: StoredOperationalStateRecord | null,
  normalized: NormalizedGpsMessage,
  positionApplied: boolean,
  derivedDelta: { distanceMeters: number | null; elapsedSeconds: number | null }
): DerivedValue<number | null> {
  if (!positionApplied && previousState) {
    return {
      source: "retained_previous_snapshot",
      value: previousState.speedKph
    };
  }

  if (normalized.speedKph !== null) {
    return {
      source: "payload",
      value: normalized.speedKph
    };
  }

  if (derivedDelta.distanceMeters !== null && derivedDelta.elapsedSeconds !== null) {
    const derivedSpeed = calculateSpeedKph(derivedDelta.distanceMeters, derivedDelta.elapsedSeconds);

    if (derivedSpeed !== null) {
      return {
        source: "derived_distance",
        value: derivedSpeed
      };
    }
  }

  return {
    source: "unknown",
    value: null
  };
}

function roundValue(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function shouldApplyPosition(candidatePositionTime: string, previousPositionTime: string | null): boolean {
  if (!previousPositionTime) {
    return true;
  }

  return isTimestampEqualOrNewer(candidatePositionTime, previousPositionTime);
}

function toRadians(value: number): number {
  return value * (Math.PI / 180);
}
