import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type {
  GtfsValidationIssue,
  NormalizedGtfsRoute,
  NormalizedGtfsServiceCalendar,
  NormalizedGtfsServiceCalendarDate,
  NormalizedGtfsStop,
  NormalizedGtfsStopTime,
  NormalizedGtfsTrip,
  ParsedGtfsFeed
} from "./types.js";

interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

interface ParsedGtfsDirectoryResult {
  feed: ParsedGtfsFeed;
  feedVersion: string | null;
  issues: GtfsValidationIssue[];
}

const REQUIRED_FILES = ["routes.txt", "stops.txt", "trips.txt", "stop_times.txt"] as const;

export async function parseGtfsDirectory(directoryPath: string, fallbackAgencyId: string): Promise<ParsedGtfsDirectoryResult> {
  const issues: GtfsValidationIssue[] = [];

  for (const fileName of REQUIRED_FILES) {
    const filePath = join(directoryPath, fileName);

    try {
      const metadata = await stat(filePath);

      if (!metadata.isFile()) {
        issues.push(createIssue(fileName, null, null, null, `${fileName} is not a regular file.`));
      }
    } catch {
      issues.push(createIssue(fileName, null, null, null, `${fileName} is missing from the GTFS package.`));
    }
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      feed: emptyFeed(),
      feedVersion: null,
      issues
    };
  }

  const agencyCsv = await readOptionalCsv(directoryPath, "agency.txt");
  const calendarCsv = await readOptionalCsv(directoryPath, "calendar.txt");
  const calendarDatesCsv = await readOptionalCsv(directoryPath, "calendar_dates.txt");
  const feedInfoCsv = await readOptionalCsv(directoryPath, "feed_info.txt");
  const resolvedAgencyId = resolveAgencyId(agencyCsv, fallbackAgencyId);
  const feedVersion = feedInfoCsv?.rows[0]?.feed_version?.trim() || null;

  if (!calendarCsv && !calendarDatesCsv) {
    issues.push(createIssue(
      "calendar.txt",
      null,
      null,
      null,
      "GTFS package does not include calendar.txt or calendar_dates.txt; schedule-based route resolution will stay limited to manual route context.",
      {},
      "warn"
    ));
  }

  const routesCsv = await readRequiredCsv(directoryPath, "routes.txt");
  const stopsCsv = await readRequiredCsv(directoryPath, "stops.txt");
  const tripsCsv = await readRequiredCsv(directoryPath, "trips.txt");
  const stopTimesCsv = await readRequiredCsv(directoryPath, "stop_times.txt");

  return {
    feed: {
      routes: parseRoutes(routesCsv, resolvedAgencyId, issues),
      serviceCalendarDates: parseServiceCalendarDates(calendarDatesCsv, issues),
      serviceCalendars: parseServiceCalendars(calendarCsv, issues),
      stopTimes: parseStopTimes(stopTimesCsv, issues),
      stops: parseStops(stopsCsv, resolvedAgencyId, issues),
      trips: parseTrips(tripsCsv, resolvedAgencyId, issues)
    },
    feedVersion,
    issues
  };
}

function createIssue(
  fileName: string,
  rowNumber: number | null,
  fieldName: string | null,
  entityKey: string | null,
  message: string,
  rawRow: Record<string, unknown> = {},
  severity: "error" | "warn" = "error"
): GtfsValidationIssue {
  return {
    entityKey,
    fieldName,
    fileName,
    message,
    rawRow,
    rowNumber,
    severity
  };
}

function emptyFeed(): ParsedGtfsFeed {
  return {
    routes: [],
    serviceCalendarDates: [],
    serviceCalendars: [],
    stopTimes: [],
    stops: [],
    trips: []
  };
}

function parseCsv(content: string): CsvParseResult {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      currentCell = "";

      if (currentRow.some((cell) => cell !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);

  if (currentRow.some((cell) => cell !== "")) {
    rows.push(currentRow);
  }

  const [headerRow, ...bodyRows] = rows;
  const headers = (headerRow ?? []).map((header) => header.trim());

  return {
    headers,
    rows: bodyRows.map((row) =>
      Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]))
    )
  };
}

function parseDate(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  if (!/^\d{8}$/.test(trimmed)) {
    return null;
  }

  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(4, 6));
  const day = Number(trimmed.slice(6, 8));

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

function parseInteger(value: string | undefined): number | null {
  if (!value || value.trim() === "") {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : null;
}

function parseNumeric(value: string | undefined): number | null {
  if (!value || value.trim() === "") {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRoutes(csv: CsvParseResult, agencyId: string, issues: GtfsValidationIssue[]): NormalizedGtfsRoute[] {
  ensureHeaders(csv.headers, ["route_id", "route_short_name", "route_type"], "routes.txt", issues);

  return csv.rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const externalRouteId = row.route_id?.trim() ?? "";
    const routeShortName = row.route_short_name?.trim() ?? "";
    const routeType = parseInteger(row.route_type);

    if (externalRouteId === "" || routeShortName === "" || routeType === null) {
      issues.push(createIssue("routes.txt", rowNumber, null, externalRouteId || null, "Route is missing required route_id, route_short_name, or route_type.", row));
      return [];
    }

    return [{
      agencyId: row.agency_id?.trim() || agencyId,
      externalRouteId,
      rawRow: row,
      routeColor: normalizeOptionalText(row.route_color),
      routeLongName: normalizeOptionalText(row.route_long_name),
      routeShortName,
      routeTextColor: normalizeOptionalText(row.route_text_color),
      routeType,
      rowNumber,
      sortOrder: parseInteger(row.route_sort_order)
    } satisfies NormalizedGtfsRoute];
  });
}

function parseServiceCalendars(csv: CsvParseResult | null, issues: GtfsValidationIssue[]): NormalizedGtfsServiceCalendar[] {
  if (!csv) {
    return [];
  }

  ensureHeaders(csv.headers, ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"], "calendar.txt", issues);

  return csv.rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const serviceId = row.service_id?.trim() ?? "";
    const startDate = parseDate(row.start_date);
    const endDate = parseDate(row.end_date);
    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((fieldName) => parseBinaryFlag(row[fieldName]));

    if (serviceId === "" || startDate === null || endDate === null || weekdays.some((value) => value === null)) {
      issues.push(createIssue("calendar.txt", rowNumber, null, serviceId || null, "Calendar row is missing required service_id, weekday flags, or valid start/end dates.", row));
      return [];
    }

    return [{
      endDate,
      friday: weekdays[4] as boolean,
      monday: weekdays[0] as boolean,
      rawRow: row,
      rowNumber,
      saturday: weekdays[5] as boolean,
      serviceId,
      startDate,
      sunday: weekdays[6] as boolean,
      thursday: weekdays[3] as boolean,
      tuesday: weekdays[1] as boolean,
      wednesday: weekdays[2] as boolean
    } satisfies NormalizedGtfsServiceCalendar];
  });
}

function parseServiceCalendarDates(csv: CsvParseResult | null, issues: GtfsValidationIssue[]): NormalizedGtfsServiceCalendarDate[] {
  if (!csv) {
    return [];
  }

  ensureHeaders(csv.headers, ["service_id", "date", "exception_type"], "calendar_dates.txt", issues);

  return csv.rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const serviceId = row.service_id?.trim() ?? "";
    const serviceDate = parseDate(row.date);
    const exceptionType = parseInteger(row.exception_type);

    if (serviceId === "" || serviceDate === null || (exceptionType !== 1 && exceptionType !== 2)) {
      issues.push(createIssue("calendar_dates.txt", rowNumber, null, serviceId || null, "Calendar date row is missing required service_id, valid date, or exception_type 1/2.", row));
      return [];
    }

    return [{
      exceptionType,
      rawRow: row,
      rowNumber,
      serviceDate,
      serviceId
    } satisfies NormalizedGtfsServiceCalendarDate];
  });
}

function parseStops(csv: CsvParseResult, agencyId: string, issues: GtfsValidationIssue[]): NormalizedGtfsStop[] {
  ensureHeaders(csv.headers, ["stop_id", "stop_name", "stop_lat", "stop_lon"], "stops.txt", issues);

  return csv.rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const externalStopId = row.stop_id?.trim() ?? "";
    const stopName = row.stop_name?.trim() ?? "";
    const latitude = parseNumeric(row.stop_lat);
    const longitude = parseNumeric(row.stop_lon);

    if (externalStopId === "" || stopName === "" || latitude === null || longitude === null) {
      issues.push(createIssue("stops.txt", rowNumber, null, externalStopId || null, "Stop is missing required stop_id, stop_name, stop_lat, or stop_lon.", row));
      return [];
    }

    return [{
      agencyId: row.agency_id?.trim() || agencyId,
      externalStopId,
      latitude,
      longitude,
      parentExternalStopId: normalizeOptionalText(row.parent_station),
      platformCode: normalizeOptionalText(row.platform_code),
      rawRow: row,
      rowNumber,
      stopCode: normalizeOptionalText(row.stop_code),
      stopDesc: normalizeOptionalText(row.stop_desc),
      stopName,
      timezone: normalizeOptionalText(row.stop_timezone),
      wheelchairBoarding: parseInteger(row.wheelchair_boarding)
    } satisfies NormalizedGtfsStop];
  });
}

function parseStopTimes(csv: CsvParseResult, issues: GtfsValidationIssue[]): NormalizedGtfsStopTime[] {
  ensureHeaders(csv.headers, ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], "stop_times.txt", issues);

  return csv.rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const tripExternalId = row.trip_id?.trim() ?? "";
    const externalStopId = row.stop_id?.trim() ?? "";
    const stopSequence = parseInteger(row.stop_sequence);
    const arrivalOffsetSeconds = parseGtfsTime(row.arrival_time);
    const departureOffsetSeconds = parseGtfsTime(row.departure_time);

    if (
      tripExternalId === "" ||
      externalStopId === "" ||
      stopSequence === null ||
      arrivalOffsetSeconds === null ||
      departureOffsetSeconds === null
    ) {
      issues.push(createIssue("stop_times.txt", rowNumber, null, tripExternalId || null, "Stop time is missing required trip_id, stop_id, stop_sequence, arrival_time, or departure_time.", row));
      return [];
    }

    return [{
      arrivalOffsetSeconds,
      departureOffsetSeconds,
      dropOffType: parseInteger(row.drop_off_type),
      externalStopId,
      pickupType: parseInteger(row.pickup_type),
      rawRow: row,
      rowNumber,
      shapeDistTraveled: parseNumeric(row.shape_dist_traveled),
      stopHeadsign: normalizeOptionalText(row.stop_headsign),
      stopSequence,
      timepoint: row.timepoint?.trim() === "1",
      tripExternalId
    } satisfies NormalizedGtfsStopTime];
  });
}

function parseTrips(csv: CsvParseResult, agencyId: string, issues: GtfsValidationIssue[]): NormalizedGtfsTrip[] {
  ensureHeaders(csv.headers, ["route_id", "service_id", "trip_id"], "trips.txt", issues);

  return csv.rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const externalTripId = row.trip_id?.trim() ?? "";
    const routeExternalId = row.route_id?.trim() ?? "";
    const serviceId = row.service_id?.trim() ?? "";

    if (externalTripId === "" || routeExternalId === "" || serviceId === "") {
      issues.push(createIssue("trips.txt", rowNumber, null, externalTripId || null, "Trip is missing required route_id, service_id, or trip_id.", row));
      return [];
    }

    return [{
      agencyId: row.agency_id?.trim() || agencyId,
      bikesAllowed: parseInteger(row.bikes_allowed),
      blockId: normalizeOptionalText(row.block_id),
      directionId: parseInteger(row.direction_id),
      externalTripId,
      rawRow: row,
      routeExternalId,
      rowNumber,
      serviceId,
      shapeId: normalizeOptionalText(row.shape_id),
      tripHeadsign: normalizeOptionalText(row.trip_headsign),
      tripShortName: normalizeOptionalText(row.trip_short_name),
      variantCode: buildVariantCode(row),
      wheelchairAccessible: parseInteger(row.wheelchair_accessible)
    } satisfies NormalizedGtfsTrip];
  });
}

function parseBinaryFlag(value: string | undefined): boolean | null {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "0") {
    return false;
  }

  if (trimmed === "1") {
    return true;
  }

  return null;
}

function parseGtfsTime(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";

  if (!/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split(":");

  if (parts.length !== 3) {
    return null;
  }

  const [hoursRaw, minutesRaw, secondsRaw] = parts;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) {
    return null;
  }

  if (minutes > 59 || seconds > 59) {
    return null;
  }

  return (hours * 3600) + (minutes * 60) + seconds;
}

function buildVariantCode(row: Record<string, string>): string {
  const direction = row.direction_id?.trim() || "x";
  const headsign = row.trip_headsign?.trim() || row.trip_short_name?.trim() || "headsign";
  const shape = row.shape_id?.trim() || "shape";
  return `${direction}:${headsign}:${shape}`.slice(0, 180);
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function ensureHeaders(headers: string[], requiredHeaders: string[], fileName: string, issues: GtfsValidationIssue[]): void {
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      issues.push(createIssue(fileName, null, header, null, `${fileName} is missing required column ${header}.`));
    }
  }
}

function resolveAgencyId(agencyCsv: CsvParseResult | null, fallbackAgencyId: string): string {
  const fromAgencyFile = agencyCsv?.rows[0]?.agency_id?.trim();
  return fromAgencyFile && fromAgencyFile !== "" ? fromAgencyFile : fallbackAgencyId;
}

async function readRequiredCsv(directoryPath: string, fileName: string): Promise<CsvParseResult> {
  const content = await readFile(join(directoryPath, fileName), "utf8");
  return parseCsv(stripBom(content));
}

async function readOptionalCsv(directoryPath: string, fileName: string): Promise<CsvParseResult | null> {
  try {
    const content = await readFile(join(directoryPath, fileName), "utf8");
    return parseCsv(stripBom(content));
  } catch {
    return null;
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

