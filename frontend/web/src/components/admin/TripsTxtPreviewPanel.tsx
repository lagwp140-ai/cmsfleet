import { useMemo, useState } from "react";

import { Panel } from "./AdminPrimitives";

interface TripsTxtPreviewPanelProps {
  disabled?: boolean;
}

interface TripsPreviewRow {
  blockId: string | null;
  directionId: string | null;
  headsign: string | null;
  routeId: string;
  rowNumber: number;
  serviceId: string;
  shapeId: string | null;
  tripId: string;
  tripShortName: string | null;
}

export function TripsTxtPreviewPanel({ disabled = false }: TripsTxtPreviewPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<TripsPreviewRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (needle === "") {
      return rows.slice(0, 200);
    }

    return rows.filter((row) => {
      return row.tripId.toLowerCase().includes(needle)
        || row.routeId.toLowerCase().includes(needle)
        || row.serviceId.toLowerCase().includes(needle)
        || (row.headsign ?? "").toLowerCase().includes(needle)
        || (row.tripShortName ?? "").toLowerCase().includes(needle)
        || (row.shapeId ?? "").toLowerCase().includes(needle)
        || (row.blockId ?? "").toLowerCase().includes(needle);
    }).slice(0, 200);
  }, [rows, search]);

  const selectedRow = selectedTripId ? rows.find((row) => row.tripId === selectedTripId) ?? null : null;

  async function handleFileChange(file: File | null) {
    if (!file) {
      setFileName(null);
      setRows([]);
      setSearch("");
      setSelectedTripId(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const content = await file.text();
      const parsedRows = parseTripsText(content);
      setFileName(file.name);
      setRows(parsedRows);
      setSearch("");
      setSelectedTripId(parsedRows[0]?.tripId ?? null);
    } catch (loadError) {
      setFileName(file.name);
      setRows([]);
      setSelectedTripId(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to parse trips.txt.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyTripId() {
    if (!selectedRow || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedRow.tripId);
    } catch {
      return;
    }
  }

  return (
    <Panel
      description="Upload a standalone GTFS trips.txt file to inspect live trip_id values without waiting for the full ZIP pipeline. This is useful when you need the current external trip IDs right away for debugging or manual matching."
      title="Preview trips.txt"
    >
      <div className="form-grid">
        <label className="field field--wide">
          <span className="field__label">Trips file</span>
          <input
            accept=".txt,text/plain,text/csv"
            className="input-control"
            disabled={disabled || isLoading}
            onChange={(event) => void handleFileChange(event.currentTarget.files?.[0] ?? null)}
            type="file"
          />
          <span className="helper-text">Expected columns: route_id, service_id, trip_id. Optional columns like trip_headsign, direction_id, block_id, and shape_id are also shown.</span>
        </label>

        <label className="field field--wide">
          <span className="field__label">Search uploaded trips</span>
          <input
            className="input-control"
            disabled={disabled || isLoading || rows.length === 0}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search by trip_id, route_id, service_id, headsign, shape, or block"
            type="text"
            value={search}
          />
        </label>
      </div>

      {fileName ? (
        <div className="detail-list" style={{ marginBottom: "16px" }}>
          <div className="detail-row">
            <div>
              <div className="detail-row__label">Loaded file</div>
              <div className="detail-row__meta">Only the first 200 matching rows are shown to keep the view responsive.</div>
            </div>
            <span className="tone-pill tone-pill--accent">{fileName}</span>
          </div>
          <div className="detail-row">
            <div>
              <div className="detail-row__label">Trip rows</div>
              <div className="detail-row__meta">Use search to narrow down to the current route, destination, or block.</div>
            </div>
            <span className="tone-pill tone-pill--neutral">{rows.length}</span>
          </div>
          <div className="detail-row">
            <div>
              <div className="detail-row__label">Selected trip_id</div>
              <div className="detail-row__meta">This is the external GTFS trip_id from the uploaded trips.txt file.</div>
            </div>
            <div className="badge-row">
              <span className="tone-pill tone-pill--good">{selectedRow?.tripId ?? "None selected"}</span>
              <button className="action-button action-button--secondary" disabled={!selectedRow} onClick={() => void handleCopyTripId()} type="button">
                Copy trip_id
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="empty-state">Reading trips.txt...</div> : null}
      {error ? <div className="empty-state">{error}</div> : null}
      {!isLoading && !error && rows.length === 0 ? <div className="empty-state">Upload a trips.txt file to browse trip IDs from the current feed.</div> : null}

      {!isLoading && !error && filteredRows.length > 0 ? (
        <div className="registry-grid gtfs-grid--single">
          {filteredRows.map((row) => (
            <article className={`registry-card${selectedTripId === row.tripId ? " registry-card--selected" : ""}`} key={`${row.tripId}-${row.rowNumber}`}>
              <div className="registry-card__header">
                <div>
                  <div className="registry-card__eyebrow">{row.routeId} ? {row.serviceId}</div>
                  <h3 className="registry-card__title">{row.headsign ?? row.tripShortName ?? row.tripId}</h3>
                  <div className="registry-card__subtext">trip_id {row.tripId}</div>
                </div>
                <div className="badge-row">
                  <span className="tone-pill tone-pill--accent">row {row.rowNumber}</span>
                  {row.directionId ? <span className="tone-pill tone-pill--neutral">dir {row.directionId}</span> : null}
                </div>
              </div>
              <div className="registry-card__specs">
                <div className="registry-card__spec"><span>Shape</span><strong>{row.shapeId ?? "Not set"}</strong></div>
                <div className="registry-card__spec"><span>Block</span><strong>{row.blockId ?? "Not set"}</strong></div>
                <div className="registry-card__spec"><span>Short name</span><strong>{row.tripShortName ?? "Not set"}</strong></div>
                <div className="registry-card__spec"><span>Destination</span><strong>{row.headsign ?? "Not set"}</strong></div>
              </div>
              <div className="registry-card__actions">
                <button className="action-button action-button--secondary" onClick={() => setSelectedTripId(row.tripId)} type="button">
                  {selectedTripId === row.tripId ? "Selected" : "Select trip_id"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function parseTripsText(content: string): TripsPreviewRow[] {
  const parsed = parseCsv(stripBom(content));
  ensureRequiredHeaders(parsed.headers, ["route_id", "service_id", "trip_id"]);

  return parsed.rows.flatMap((row, index) => {
    const routeId = row.route_id?.trim() ?? "";
    const serviceId = row.service_id?.trim() ?? "";
    const tripId = row.trip_id?.trim() ?? "";

    if (routeId === "" || serviceId === "" || tripId === "") {
      return [];
    }

    return [{
      blockId: normalizeOptionalText(row.block_id),
      directionId: normalizeOptionalText(row.direction_id),
      headsign: normalizeOptionalText(row.trip_headsign),
      routeId,
      rowNumber: index + 2,
      serviceId,
      shapeId: normalizeOptionalText(row.shape_id),
      tripId,
      tripShortName: normalizeOptionalText(row.trip_short_name)
    } satisfies TripsPreviewRow];
  });
}

function ensureRequiredHeaders(headers: string[], requiredHeaders: string[]): void {
  const missing = requiredHeaders.filter((header) => !headers.includes(header));

  if (missing.length > 0) {
    throw new Error(`trips.txt is missing required columns: ${missing.join(", ")}.`);
  }
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
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

    if (!inQuotes && (character === "
" || character === "")) {
      if (character === "" && nextCharacter === "
") {
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
    rows: bodyRows.map((row) => Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""])))
  };
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
