import type { GpsIngestionAdapter, NormalizedGpsMessage, RejectedGpsMessageInput } from "./types.js";

interface NormalizeHttpGpsPayloadOptions {
  adapter: GpsIngestionAdapter;
  receivedAt: string;
  sourceName: string;
  vehicleIdField: string;
}

export class GpsPayloadValidationError extends Error {
  readonly payload: RejectedGpsMessageInput;

  constructor(message: string, payload: RejectedGpsMessageInput) {
    super(message);
    this.name = "GpsPayloadValidationError";
    this.payload = payload;
  }
}

export function normalizeHttpGpsPayload(
  body: unknown,
  options: NormalizeHttpGpsPayloadOptions
): NormalizedGpsMessage {
  const rejected: RejectedGpsMessageInput = {
    accuracyM: null,
    adapter: options.adapter,
    headingDeg: null,
    latitude: null,
    longitude: null,
    metadata: {
      configuredVehicleIdField: options.vehicleIdField,
      transport: options.adapter
    },
    positionTime: null,
    providerMessageId: null,
    rawPayload: body,
    reason: "validation_failed",
    receivedAt: options.receivedAt,
    sourceName: options.sourceName,
    speedKph: null,
    vehicleIdentifier: null
  };

  if (!isPlainObject(body)) {
    throw new GpsPayloadValidationError("GPS payload must be a JSON object.", rejected);
  }

  rejected.providerMessageId = readOptionalString(body.providerMessageId ?? body.messageId ?? body.id);
  rejected.vehicleIdentifier = readOptionalString(body[options.vehicleIdField] ?? body.vehicleId ?? body.unitCode);

  const latitude = parseRequiredCoordinate(body.latitude ?? body.lat, "latitude", -90, 90, rejected);
  const longitude = parseRequiredCoordinate(body.longitude ?? body.lon ?? body.lng, "longitude", -180, 180, rejected);
  const speedKph = parseOptionalSpeed(body.speedKph ?? body.speed ?? body.speedKphEstimate, rejected);
  const headingDeg = parseOptionalHeading(body.headingDeg ?? body.heading, rejected);
  const accuracyM = parseOptionalPositiveNumber(body.accuracyM ?? body.accuracy, "accuracyM", rejected);
  const timestampInput = body.timestamp ?? body.positionTime ?? body.fixTime ?? body.recordedAt ?? options.receivedAt;
  const positionTime = normalizeTimestamp(timestampInput, rejected, options.receivedAt);

  rejected.latitude = latitude;
  rejected.longitude = longitude;
  rejected.speedKph = speedKph;
  rejected.headingDeg = headingDeg;
  rejected.accuracyM = accuracyM;
  rejected.positionTime = positionTime;

  if (!rejected.vehicleIdentifier) {
    throw new GpsPayloadValidationError(
      `GPS payload is missing a vehicle identifier in ${options.vehicleIdField}.`,
      rejected
    );
  }

  const metadata = {
    ...extractMetadata(body.metadata),
    configuredVehicleIdField: options.vehicleIdField,
    normalizedFrom: "http_json",
    receivedAt: options.receivedAt,
    sourceName: options.sourceName,
    timestampSource: timestampInput === options.receivedAt ? "server_received_at" : "device_payload"
  };

  return {
    accuracyM,
    adapter: options.adapter,
    headingDeg,
    latitude,
    longitude,
    metadata,
    positionTime,
    providerMessageId: rejected.providerMessageId,
    rawPayload: body,
    receivedAt: options.receivedAt,
    sourceName: options.sourceName,
    speedKph,
    vehicleIdentifier: rejected.vehicleIdentifier
  };
}

function extractMetadata(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? { ...value } : {};
}

function normalizeTimestamp(
  value: unknown,
  rejected: RejectedGpsMessageInput,
  fallbackTimestamp: string
): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) >= 1_000_000_000_000 ? value : value * 1000;
    return toIsoTimestamp(milliseconds, rejected);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return fallbackTimestamp;
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const numericValue = Number(trimmed);
      const milliseconds = Math.abs(numericValue) >= 1_000_000_000_000 ? numericValue : numericValue * 1000;
      return toIsoTimestamp(milliseconds, rejected);
    }

    const parsed = Date.parse(trimmed);

    if (!Number.isNaN(parsed)) {
      return toIsoTimestamp(parsed, rejected);
    }
  }

  rejected.reason = "invalid_timestamp";
  throw new GpsPayloadValidationError("GPS payload timestamp is invalid.", rejected);
}

function toIsoTimestamp(milliseconds: number, rejected: RejectedGpsMessageInput): string {
  const date = new Date(milliseconds);

  if (Number.isNaN(date.getTime())) {
    rejected.reason = "invalid_timestamp";
    throw new GpsPayloadValidationError("GPS payload timestamp is invalid.", rejected);
  }

  return date.toISOString();
}

function parseOptionalHeading(value: unknown, rejected: RejectedGpsMessageInput): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = parseNumber(value, "headingDeg", rejected);
  const normalized = ((parsed % 360) + 360) % 360;
  return roundValue(normalized, 2);
}

function parseOptionalPositiveNumber(
  value: unknown,
  fieldName: string,
  rejected: RejectedGpsMessageInput
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = parseNumber(value, fieldName, rejected);

  if (parsed < 0) {
    rejected.reason = `invalid_${fieldName}`;
    throw new GpsPayloadValidationError(`${fieldName} cannot be negative.`, rejected);
  }

  return roundValue(parsed, 2);
}

function parseOptionalSpeed(value: unknown, rejected: RejectedGpsMessageInput): number | null {
  return parseOptionalPositiveNumber(value, "speedKph", rejected);
}

function parseNumber(value: unknown, fieldName: string, rejected: RejectedGpsMessageInput): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    rejected.reason = `invalid_${fieldName}`;
    throw new GpsPayloadValidationError(`${fieldName} must be numeric.`, rejected);
  }

  return parsed;
}

function parseRequiredCoordinate(
  value: unknown,
  fieldName: "latitude" | "longitude",
  minimum: number,
  maximum: number,
  rejected: RejectedGpsMessageInput
): number {
  const parsed = parseNumber(value, fieldName, rejected);

  if (parsed < minimum || parsed > maximum) {
    rejected.reason = `invalid_${fieldName}`;
    throw new GpsPayloadValidationError(`${fieldName} is outside the allowed range.`, rejected);
  }

  return roundValue(parsed, 6);
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function roundValue(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


