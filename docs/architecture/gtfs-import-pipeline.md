# GTFS Import Pipeline

The GTFS pipeline treats schedule data as a versioned operational asset instead of a destructive overwrite.

## Current Flow

1. A dispatcher starts an import from the admin UI by either uploading a GTFS zip or providing a local path visible to the API host.
2. The API creates an `operations.gtfs_import_jobs` record and unpacks the feed when needed.
3. Required GTFS files are parsed into normalized route, stop, trip, and stop-time records, and optional service calendars from `calendar.txt` and `calendar_dates.txt` are loaded when present.
4. Validation findings are written to `operations.gtfs_import_errors` and normalized rows are copied into staging tables.
5. If validation fails, the job remains recorded with full error history and no dataset becomes active.
6. If validation succeeds, the API creates an immutable `operations.gtfs_datasets` record and loads relational data into the `transit` schema under a dataset-scoped version.
7. Activation promotes one dataset at a time by marking its routes and trips active, while preserving the previous dataset for rollback.

## API Surface

- `GET /api/admin/gtfs/overview`: active dataset, retained datasets, and recent import jobs
- `GET /api/admin/gtfs/imports/:jobId/errors`: validation errors and warnings for one import job
- `POST /api/admin/gtfs/imports/from-path`: import from a server-local zip or extracted GTFS directory
- `POST /api/admin/gtfs/imports/upload`: import from a browser-uploaded GTFS zip
- `POST /api/admin/gtfs/datasets/:datasetId/activate`: promote a validated dataset to active service
- `POST /api/admin/gtfs/datasets/:datasetId/rollback`: restore a retained prior dataset

## Storage Model

- `operations.gtfs_import_jobs`: lifecycle, source, counts, and summary for each run
- `operations.gtfs_import_errors`: per-job validation findings
- `operations.gtfs_datasets`: versioned datasets with activation and rollback lineage
- `operations.gtfs_staging_*`: normalized staging copies for auditability and future loader optimization
- `transit.service_calendars` and `transit.service_calendar_dates`: versioned GTFS service-day data for schedule-based route resolution
- `transit.routes`, `transit.stops`, `transit.trips`: dataset-scoped records so multiple schedule versions can coexist safely

## Design Notes

- The import service boundary is intentionally separate from parsing and persistence so remote URL sync, scheduled sync, or Java-based processing can plug into the same activation model later.
- Activation is fail-safe: a dataset must exist before it can be promoted, preventing accidental deactivation of all route data.
- Previous datasets are preserved to support operator rollback during feed incidents.
- Current parsing is correctness-first and row-oriented. For large feeds, the next optimization step is batched inserts or `COPY`-based loading from staging.
