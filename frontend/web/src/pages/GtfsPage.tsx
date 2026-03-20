import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  activateGtfsDataset,
  fetchGtfsDatasetCatalog,
  fetchGtfsErrors,
  fetchGtfsOverview,
  fetchGtfsTripStops,
  importGtfsFromPath,
  importGtfsUpload,
  rollbackGtfsDataset
} from "../admin/gtfsClient";
import type {
  GtfsDatasetCatalogResponse,
  GtfsDatasetRecord,
  GtfsImportErrorRecord,
  GtfsImportJobRecord,
  GtfsOverviewResponse,
  GtfsRouteCatalogRecord,
  GtfsTripCatalogRecord,
  GtfsTripStopRecord
} from "../admin/gtfsTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";
import { formatConsoleDateTime, formatGtfsOffset } from "../lib/time";

export function GtfsPage() {
  const navigate = useNavigate();
  const { dashboard, refreshConsole } = useAdminConsole();
  const { logout, user } = useAuth();
  const [catalog, setCatalog] = useState<GtfsDatasetCatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<GtfsImportErrorRecord[]>([]);
  const [feedback, setFeedback] = useState<{ body: string; title: string; tone: "critical" | "good" | "warn" } | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isErrorsLoading, setIsErrorsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStopsLoading, setIsStopsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const [localPathActivateOnSuccess, setLocalPathActivateOnSuccess] = useState(false);
  const [localPathDatasetLabel, setLocalPathDatasetLabel] = useState("");
  const [overview, setOverview] = useState<GtfsOverviewResponse | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripStops, setTripStops] = useState<GtfsTripStopRecord[]>([]);
  const [uploadActivateOnSuccess, setUploadActivateOnSuccess] = useState(true);
  const [uploadDatasetLabel, setUploadDatasetLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const canManageGtfs = user?.permissions.includes("dispatch:manage") ?? false;
  const locale = dashboard?.tenant.locale;
  const jobs = overview?.jobs ?? [];
  const datasets = overview?.datasets ?? [];
  const activeDataset = overview?.activeDataset ?? null;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? activeDataset;
  const selectedRoute = catalog?.routes.find((route) => route.id === selectedRouteId) ?? null;
  const selectedTrip = catalog?.trips.find((trip) => trip.id === selectedTripId) ?? null;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const pendingActivationCount = datasets.filter((dataset) => !dataset.isActive).length;
  const totalValidationIssues = jobs.reduce((sum, job) => sum + job.validationErrorCount + job.warningCount, 0);

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadOverview = useEffectEvent(async (preferredJobId?: string | null, preferredDatasetId?: string | null) => {
    if (!canManageGtfs) {
      setIsLoading(false);
      setOverview(null);
      setSelectedDatasetId(null);
      setSelectedJobId(null);
      setSelectedRouteId(null);
      setSelectedTripId(null);
      setTripStops([]);
      setCatalog(null);
      setErrors([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextOverview = await fetchGtfsOverview();
      const nextSelectedJobId = pickSelectedJobId(nextOverview.jobs, preferredJobId ?? selectedJobId);
      const nextSelectedDatasetId = pickSelectedDatasetId(nextOverview.datasets, preferredDatasetId ?? selectedDatasetId, nextOverview.activeDataset?.id ?? null);

      startTransition(() => {
        setOverview(nextOverview);
        setSelectedDatasetId(nextSelectedDatasetId);
        setSelectedJobId(nextSelectedJobId);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 403) {
        setError("Your role can access the admin shell, but GTFS operations require the dispatch:manage permission.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load GTFS import overview.");
    } finally {
      setIsLoading(false);
    }
  });

  const loadCatalog = useEffectEvent(async (datasetId: string | null, preferredRouteId?: string | null, preferredTripId?: string | null) => {
    if (!canManageGtfs || !datasetId) {
      setCatalog(null);
      setIsCatalogLoading(false);
      setSelectedRouteId(null);
      setSelectedTripId(null);
      setTripStops([]);
      return;
    }

    setIsCatalogLoading(true);

    try {
      const nextCatalog = await fetchGtfsDatasetCatalog(datasetId, preferredRouteId ?? selectedRouteId ?? undefined);
      const nextSelectedRouteId = nextCatalog.selectedRouteId;
      const nextSelectedTripId = pickSelectedTripId(nextCatalog.trips, preferredTripId ?? selectedTripId);

      startTransition(() => {
        setCatalog(nextCatalog);
        setSelectedRouteId(nextSelectedRouteId);
        setSelectedTripId(nextSelectedTripId);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load the GTFS dataset catalog.");
    } finally {
      setIsCatalogLoading(false);
    }
  });

  const loadErrors = useEffectEvent(async (job: GtfsImportJobRecord | null) => {
    if (!canManageGtfs || !job || (job.validationErrorCount === 0 && job.warningCount === 0 && job.status !== "failed")) {
      setErrors([]);
      setIsErrorsLoading(false);
      return;
    }

    setIsErrorsLoading(true);

    try {
      const nextErrors = await fetchGtfsErrors(job.id, 200);
      startTransition(() => {
        setErrors(nextErrors);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load GTFS validation errors.");
    } finally {
      setIsErrorsLoading(false);
    }
  });

  const loadTripStops = useEffectEvent(async (datasetId: string | null, tripId: string | null) => {
    if (!canManageGtfs || !datasetId || !tripId) {
      setTripStops([]);
      setIsStopsLoading(false);
      return;
    }

    setIsStopsLoading(true);

    try {
      const nextStops = await fetchGtfsTripStops(datasetId, tripId);
      startTransition(() => {
        setTripStops(nextStops);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load GTFS stop times for the selected trip.");
    } finally {
      setIsStopsLoading(false);
    }
  });

  useEffect(() => {
    void loadOverview();
  }, [canManageGtfs]);

  useEffect(() => {
    void loadCatalog(selectedDatasetId);
  }, [canManageGtfs, selectedDatasetId]);

  useEffect(() => {
    void loadErrors(selectedJob);
  }, [canManageGtfs, selectedJob?.id, selectedJob?.status, selectedJob?.validationErrorCount, selectedJob?.warningCount]);

  useEffect(() => {
    void loadTripStops(selectedDatasetId, selectedTripId);
  }, [canManageGtfs, selectedDatasetId, selectedTripId]);

  async function handleImportFromPath() {
    if (!canManageGtfs || localPath.trim() === "") {
      setFeedback({ body: "Provide a local server path to a GTFS zip file or extracted directory.", title: "Path required", tone: "critical" });
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      const result = await importGtfsFromPath({
        activateOnSuccess: localPathActivateOnSuccess,
        datasetLabel: localPathDatasetLabel.trim() || undefined,
        filePath: localPath.trim()
      });

      await loadOverview(result.jobId, result.datasetId ?? selectedDatasetId);
      await refreshConsole();
      setFeedback({
        body: result.status === "succeeded"
          ? localPathActivateOnSuccess
            ? "The GTFS package was imported, validated, activated, and is now ready for route and trip inspection."
            : "The GTFS package was imported and staged as a selectable dataset. Use the explorer below to inspect routes, trips, and stop sequences."
          : "The GTFS package was staged for review, but validation errors blocked activation.",
        title: result.status === "succeeded" ? "GTFS import completed" : "GTFS import needs review",
        tone: result.status === "succeeded" ? "good" : "warn"
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to import GTFS package from the provided path.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUploadImport() {
    if (!canManageGtfs || !uploadFile) {
      setFeedback({ body: "Select a GTFS zip file from your workstation before starting the upload.", title: "Zip file required", tone: "critical" });
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      const zipBase64 = await readFileAsBase64(uploadFile);
      const result = await importGtfsUpload({
        activateOnSuccess: uploadActivateOnSuccess,
        datasetLabel: uploadDatasetLabel.trim() || undefined,
        fileName: uploadFile.name,
        zipBase64
      });

      await loadOverview(result.jobId, result.datasetId ?? selectedDatasetId);
      await refreshConsole();
      setFeedback({
        body: result.status === "succeeded"
          ? uploadActivateOnSuccess
            ? "The uploaded feed validated successfully, is active now, and can be explored route by route below."
            : "The uploaded feed validated successfully and is ready for manual activation and inspection."
          : "The uploaded feed was stored for inspection, but validation blocked dataset creation.",
        title: result.status === "succeeded" ? "GTFS upload completed" : "GTFS upload needs review",
        tone: result.status === "succeeded" ? "good" : "warn"
      });
      setUploadFile(null);
      const fileInput = document.getElementById("gtfs-upload-input") as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to import the uploaded GTFS package.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleActivateDataset(dataset: GtfsDatasetRecord, rollback: boolean) {
    if (!canManageGtfs) {
      return;
    }

    const actionLabel = rollback ? "roll back to" : "activate";

    if (!window.confirm(`Do you want to ${actionLabel} dataset ${dataset.datasetLabel}?`)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      if (rollback) {
        await rollbackGtfsDataset(dataset.id);
      } else {
        await activateGtfsDataset(dataset.id);
      }

      await loadOverview(null, dataset.id);
      await refreshConsole();
      setFeedback({
        body: rollback
          ? `${dataset.datasetLabel} is now restored as the active GTFS dataset.`
          : `${dataset.datasetLabel} is now the active GTFS dataset for route, trip, and stop-time lookups.`,
        title: rollback ? "Dataset rollback completed" : "Dataset activated",
        tone: "good"
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to update the active GTFS dataset.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSelectDataset(datasetId: string) {
    setSelectedDatasetId(datasetId);
    setSelectedRouteId(null);
    setSelectedTripId(null);
    setTripStops([]);
  }

  function handleSelectRoute(routeId: string) {
    void loadCatalog(selectedDatasetId, routeId, null);
  }

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          canManageGtfs ? (
            <button className="action-button action-button--secondary" onClick={() => void loadOverview()} type="button">
              Refresh feeds
            </button>
          ) : undefined
        }
        description="Import, validate, stage, activate, and inspect GTFS datasets without losing prior versions. The explorer below now exposes real routes, trips, directions, destinations, and stop sequences from each retained feed."
        eyebrow="Transit Feed Control"
        title="GTFS"
      />

      {!canManageGtfs ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can use the admin shell, but GTFS imports and dataset activation require the dispatch:manage permission.`}
          title="GTFS management restricted"
          tone="warn"
        />
      ) : null}

      {feedback ? <Notice body={feedback.body} title={feedback.title} tone={feedback.tone} /> : null}
      {error ? <Notice body={error} title="GTFS operations unavailable" tone="critical" /> : null}

      <section className="metric-grid">
        <MetricCard detail="Datasets currently retained in PostgreSQL for activation, rollback, and historical traceability." label="Datasets" tone="accent" value={String(datasets.length).padStart(2, "0")} />
        <MetricCard detail="Jobs that finished with validation or processing failures and may need operator action." label="Failed jobs" tone={failedJobs > 0 ? "warn" : "good"} value={String(failedJobs).padStart(2, "0")} />
        <MetricCard detail="Non-active datasets preserved for manual promotion or rollback." label="Standby versions" tone={pendingActivationCount > 0 ? "accent" : "neutral"} value={String(pendingActivationCount).padStart(2, "0")} />
        <MetricCard detail="Combined validation errors and warnings tracked across the currently loaded job history." label="Reported issues" tone={totalValidationIssues > 0 ? "warn" : "good"} value={String(totalValidationIssues).padStart(2, "0")} />
      </section>

      <div className="split-layout">
        <div className="stack-card">
          <Panel description="Trigger a server-side GTFS import from a filesystem path accessible to the API service. Use this for mounted feed directories or scheduled job handoff locations." title="Import from local path">
            <form className="form-grid" onSubmit={(event) => {
              event.preventDefault();
              void handleImportFromPath();
            }}>
              <label className="field field--wide">
                <span className="field__label">GTFS file path</span>
                <input className="input-control" disabled={!canManageGtfs || isSubmitting} onChange={(event) => setLocalPath(event.currentTarget.value)} placeholder="C:\\feeds\\agency\\latest.zip" type="text" value={localPath} />
                <span className="helper-text">Accepts either a `.zip` archive or an extracted GTFS directory on the API host.</span>
              </label>
              <label className="field field--wide">
                <span className="field__label">Dataset label</span>
                <input className="input-control" disabled={!canManageGtfs || isSubmitting} onChange={(event) => setLocalPathDatasetLabel(event.currentTarget.value)} placeholder="Spring 2026 weekday update" type="text" value={localPathDatasetLabel} />
              </label>
              <div className="checkbox-row field--wide">
                <label className="checkbox-pill">
                  <input checked={localPathActivateOnSuccess} disabled={!canManageGtfs || isSubmitting} onChange={(event) => setLocalPathActivateOnSuccess(event.currentTarget.checked)} type="checkbox" />
                  <span>Activate automatically after validation</span>
                </label>
              </div>
              <div className="inline-form-actions field--wide">
                <button className="action-button action-button--primary" disabled={!canManageGtfs || isSubmitting} type="submit">
                  {isSubmitting ? "Importing..." : "Import from path"}
                </button>
              </div>
            </form>
          </Panel>

          <Panel description="Upload a GTFS zip directly from the browser for ad hoc operator-driven imports. The feed is unpacked, staged, validated, and versioned in the same backend pipeline." title="Upload GTFS zip">
            <form className="form-grid" onSubmit={(event) => {
              event.preventDefault();
              void handleUploadImport();
            }}>
              <label className="field field--wide">
                <span className="field__label">Zip archive</span>
                <input className="input-control" disabled={!canManageGtfs || isSubmitting} id="gtfs-upload-input" accept=".zip,application/zip" onChange={(event) => setUploadFile(event.currentTarget.files?.[0] ?? null)} type="file" />
                <span className="helper-text">Routes, trips, directions, stop_times, and destinations from the uploaded feed are all exposed in the explorer once validation succeeds.</span>
              </label>
              <label className="field field--wide">
                <span className="field__label">Dataset label</span>
                <input className="input-control" disabled={!canManageGtfs || isSubmitting} onChange={(event) => setUploadDatasetLabel(event.currentTarget.value)} placeholder="Weekend emergency schedule" type="text" value={uploadDatasetLabel} />
              </label>
              <div className="checkbox-row field--wide">
                <label className="checkbox-pill">
                  <input checked={uploadActivateOnSuccess} disabled={!canManageGtfs || isSubmitting} onChange={(event) => setUploadActivateOnSuccess(event.currentTarget.checked)} type="checkbox" />
                  <span>Activate automatically after validation</span>
                </label>
              </div>
              <div className="inline-form-actions field--wide">
                <button className="action-button action-button--primary" disabled={!canManageGtfs || isSubmitting} type="submit">
                  {isSubmitting ? "Uploading..." : "Upload zip"}
                </button>
              </div>
            </form>
          </Panel>

          <Panel description="Current feed posture and the operating model the CMS uses to preserve known-good schedule versions while allowing manual promotion and rollback." title="Feed posture">
            <div className="detail-list">
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Active dataset</div>
                  <div className="detail-row__meta">Only one GTFS dataset is marked active for route and trip lookup at a time.</div>
                </div>
                <span className={`tone-pill tone-pill--${activeDataset ? "good" : "neutral"}`}>{activeDataset?.datasetLabel ?? "None active"}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Explorer dataset</div>
                  <div className="detail-row__meta">The route and trip explorer can inspect either the active dataset or a standby version before activation.</div>
                </div>
                <span className="tone-pill tone-pill--accent">{selectedDataset?.datasetLabel ?? "No dataset selected"}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Version preservation</div>
                  <div className="detail-row__meta">Previous datasets remain available for rollback instead of being overwritten by newer imports.</div>
                </div>
                <span className="tone-pill tone-pill--accent">Enabled</span>
              </div>
            </div>
          </Panel>
        </div>

        <div className="stack-card">
          <Panel description="Validated datasets stay available for controlled promotion, rollback, and historical traceability. Activation switches the live route and trip catalog to the selected version." title="Datasets">
            {isLoading ? (
              <div className="empty-state">Loading GTFS datasets...</div>
            ) : datasets.length === 0 ? (
              <div className="empty-state">No GTFS datasets have been imported yet.</div>
            ) : (
              <div className="registry-grid gtfs-grid--single">
                {datasets.map((dataset) => {
                  const canRollbackToDataset = activeDataset?.previousDatasetId === dataset.id;

                  return (
                    <article className={`registry-card${selectedDatasetId === dataset.id ? " registry-card--selected" : ""}`} key={dataset.id}>
                      <div className="registry-card__header">
                        <div>
                          <div className="registry-card__eyebrow">{dataset.fileName ?? dataset.sourceType}</div>
                          <h3 className="registry-card__title">{dataset.datasetLabel}</h3>
                          <div className="registry-card__subtext">{formatDatasetMeta(dataset, locale)}</div>
                        </div>
                        <div className="badge-row">
                          <span className={`tone-pill tone-pill--${dataset.isActive ? "good" : dataset.status === "archived" ? "neutral" : "accent"}`}>{dataset.isActive ? "Active" : formatStatusLabel(dataset.status)}</span>
                          <span className="tone-pill tone-pill--neutral">{dataset.routeCount} routes</span>
                          <span className="tone-pill tone-pill--neutral">{dataset.tripCount} trips</span>
                        </div>
                      </div>
                      <div className="registry-card__specs">
                        <div className="registry-card__spec"><span>Stops</span><strong>{dataset.stopCount}</strong></div>
                        <div className="registry-card__spec"><span>Stop times</span><strong>{dataset.stopTimeCount}</strong></div>
                        <div className="registry-card__spec"><span>Activated</span><strong>{dataset.activatedAt ? formatConsoleDateTime(dataset.activatedAt, locale) : "Not active"}</strong></div>
                        <div className="registry-card__spec"><span>Source</span><strong>{dataset.sourceUri ?? dataset.sourceType}</strong></div>
                      </div>
                      <div className="registry-card__actions">
                        <button className="action-button action-button--secondary" onClick={() => handleSelectDataset(dataset.id)} type="button">
                          {selectedDatasetId === dataset.id ? "Exploring" : "Explore dataset"}
                        </button>
                        {!dataset.isActive ? (
                          <button className="action-button action-button--secondary" disabled={!canManageGtfs || isSubmitting} onClick={() => void handleActivateDataset(dataset, false)} type="button">
                            Activate dataset
                          </button>
                        ) : null}
                        {canRollbackToDataset ? (
                          <button className="action-button action-button--ghost" disabled={!canManageGtfs || isSubmitting} onClick={() => void handleActivateDataset(dataset, true)} type="button">
                            Roll back to this
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel description="Every import records lifecycle status, counts, and validation totals so operators can review whether a feed was staged, activated, or rejected." title="Import history">
            {isLoading ? (
              <div className="empty-state">Loading GTFS import history...</div>
            ) : jobs.length === 0 ? (
              <div className="empty-state">No GTFS import jobs have been recorded yet.</div>
            ) : (
              <div className="event-list">
                {jobs.map((job) => (
                  <article className="event-item" key={job.id}>
                    <div className="event-item__header">
                      <strong>{job.sourceType === "upload" ? "Browser upload" : job.sourceType === "local_path" ? "Local path import" : formatStatusLabel(job.sourceType)}</strong>
                      <span>{formatConsoleDateTime(job.createdAt, locale)}</span>
                    </div>
                    <div className="event-item__body">{job.sourceUri}</div>
                    <div className="event-item__meta">
                      <span className={`tone-pill tone-pill--${jobTone(job.status)}`}>{formatStatusLabel(job.status)}</span>
                      <span>{job.routeCount} routes</span>
                      <span>{job.tripCount} trips</span>
                      <span>{job.stopCount} stops</span>
                      <span>{job.stopTimeCount} stop times</span>
                      <span>{job.validationErrorCount} errors</span>
                      <span>{job.warningCount} warnings</span>
                    </div>
                    {job.errorMessage ? <div className="helper-text">{job.errorMessage}</div> : null}
                    <div className="registry-card__actions">
                      <button className="action-button action-button--secondary" onClick={() => setSelectedJobId(job.id)} type="button">
                        {selectedJobId === job.id ? "Inspecting" : "Inspect job"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel description="Validation findings are preserved separately from the live dataset so a failed or warning-heavy import can be reviewed before activation." title={selectedJob ? `Validation report for job ${selectedJob.id.slice(0, 8)}` : "Validation report"}>
            {selectedJob === null ? (
              <div className="empty-state">Select an import job to inspect validation output.</div>
            ) : isErrorsLoading ? (
              <div className="empty-state">Loading validation findings...</div>
            ) : errors.length === 0 ? (
              <div className="empty-state">This job has no recorded validation errors or warnings.</div>
            ) : (
              <div className="event-list">
                {errors.map((item) => (
                  <article className="event-item" key={item.id}>
                    <div className="event-item__header">
                      <strong>{item.fileName}</strong>
                      <span>{item.rowNumber ? `row ${item.rowNumber}` : "feed-level"}</span>
                    </div>
                    <div className="event-item__body">{item.message}</div>
                    <div className="event-item__meta">
                      <span className={`tone-pill tone-pill--${item.severity === "error" ? "critical" : "warn"}`}>{item.severity}</span>
                      {item.fieldName ? <span>{item.fieldName}</span> : null}
                      {item.entityKey ? <span>{item.entityKey}</span> : null}
                      <span>{formatConsoleDateTime(item.createdAt, locale)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <section className="panel-grid panel-grid--two">
        <Panel description="Explore imported routes, transport types, and destination families from the selected dataset. This reflects the actual contents of your uploaded GTFS package, not only summary counts." title="Route catalog">
          {isCatalogLoading ? (
            <div className="empty-state">Loading routes from the selected dataset...</div>
          ) : !catalog || catalog.routes.length === 0 ? (
            <div className="empty-state">Select a validated dataset to inspect its routes and destinations.</div>
          ) : (
            <div className="event-list">
              {catalog.routes.map((route) => (
                <article className="event-item" key={route.id}>
                  <div className="event-item__header">
                    <strong>{route.routeShortName} � {routeTypeLabel(route.routeType)}</strong>
                    <span>{route.tripCount} trips</span>
                  </div>
                  <div className="event-item__body">{route.routeLongName ?? summarizeDestinations(route)}</div>
                  <div className="event-item__meta">
                    <span className="tone-pill tone-pill--accent">{route.destinationCount} destinations</span>
                    {route.directionNames.slice(0, 2).map((name) => <span key={name}>{name}</span>)}
                    {route.routeColor ? <span>#{route.routeColor}</span> : null}
                  </div>
                  <div className="registry-card__actions">
                    <button className="action-button action-button--secondary" onClick={() => handleSelectRoute(route.id)} type="button">
                      {selectedRouteId === route.id ? "Inspecting route" : "Inspect route"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel description="Trips are shown for the selected route, including headsigns, direction names, shape IDs, service IDs, and stop counts. This is where you can confirm the feed imported the real working service patterns." title={selectedRoute ? `Trips for route ${selectedRoute.routeShortName}` : "Trips"}>
          {isCatalogLoading ? (
            <div className="empty-state">Loading trips for the selected route...</div>
          ) : !selectedRoute ? (
            <div className="empty-state">Select a route to inspect its trips and destinations.</div>
          ) : catalog?.trips.length ? (
            <div className="registry-grid gtfs-grid--single">
              {catalog.trips.map((trip) => (
                <article className={`registry-card${selectedTripId === trip.id ? " registry-card--selected" : ""}`} key={trip.id}>
                  <div className="registry-card__header">
                    <div>
                      <div className="registry-card__eyebrow">{trip.routeShortName} � {trip.serviceId}</div>
                      <h3 className="registry-card__title">{formatTripTitle(trip)}</h3>
                      <div className="registry-card__subtext">{buildTripMeta(trip)}</div>
                    </div>
                    <div className="badge-row">
                      <span className="tone-pill tone-pill--accent">{formatGtfsOffset(trip.startOffsetSeconds)} - {formatGtfsOffset(trip.endOffsetSeconds)}</span>
                      <span className="tone-pill tone-pill--neutral">{trip.stopCount} stops</span>
                    </div>
                  </div>
                  <div className="registry-card__specs">
                    <div className="registry-card__spec"><span>Direction</span><strong>{trip.directionName ?? trip.variantHeadsign ?? trip.directionId ?? "Not set"}</strong></div>
                    <div className="registry-card__spec"><span>Shape</span><strong>{trip.shapeId ?? "Not set"}</strong></div>
                    <div className="registry-card__spec"><span>Block</span><strong>{trip.blockId ?? "Not set"}</strong></div>
                    <div className="registry-card__spec"><span>Accessibility</span><strong>{formatAccessibility(trip)}</strong></div>
                  </div>
                  <div className="registry-card__actions">
                    <button className="action-button action-button--secondary" onClick={() => setSelectedTripId(trip.id)} type="button">
                      {selectedTripId === trip.id ? "Inspecting stops" : "Inspect stop times"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No trips were found for the selected route in this dataset.</div>
          )}
        </Panel>
      </section>

      <Panel description="Stop times for the selected trip, including arrival and departure times, stop order, and optional stop-level headsign overrides. This makes it much easier to validate real imported destinations and service patterns." title={selectedTrip ? `Stop sequence for ${formatTripTitle(selectedTrip)}` : "Stop sequence"}>
        {isStopsLoading ? (
          <div className="empty-state">Loading stop sequence...</div>
        ) : !selectedTrip ? (
          <div className="empty-state">Select a trip to inspect stop_times and stop ordering.</div>
        ) : tripStops.length === 0 ? (
          <div className="empty-state">This trip has no stored stop times yet.</div>
        ) : (
          <div className="event-list">
            {tripStops.map((stop) => (
              <article className="event-item" key={`${stop.stopId}-${stop.stopSequence}`}>
                <div className="event-item__header">
                  <strong>{stop.stopSequence}. {stop.stopName}</strong>
                  <span>{formatGtfsOffset(stop.arrivalOffsetSeconds)} / {formatGtfsOffset(stop.departureOffsetSeconds)}</span>
                </div>
                <div className="event-item__body">{stop.stopCode ? `Stop code ${stop.stopCode}` : "No public stop code"}</div>
                <div className="event-item__meta">
                  <span>{stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</span>
                  {stop.stopHeadsign ? <span>Headsign override: {stop.stopHeadsign}</span> : null}
                  {stop.pickupType !== null ? <span>Pickup {stop.pickupType}</span> : null}
                  {stop.dropOffType !== null ? <span>Drop-off {stop.dropOffType}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function buildTripMeta(trip: GtfsTripCatalogRecord): string {
  const parts = [trip.externalTripId];

  if (trip.directionName) {
    parts.push(trip.directionName);
  } else if (trip.variantHeadsign) {
    parts.push(trip.variantHeadsign);
  }

  if (trip.headsign) {
    parts.push(`destination ${trip.headsign}`);
  }

  return parts.join(" � ");
}

function formatAccessibility(trip: GtfsTripCatalogRecord): string {
  const labels: string[] = [];

  if (trip.wheelchairAccessible !== null) {
    labels.push(`wheelchair ${trip.wheelchairAccessible}`);
  }

  if (trip.bikesAllowed !== null) {
    labels.push(`bikes ${trip.bikesAllowed}`);
  }

  return labels[0] ?? "Not set";
}

function formatDatasetMeta(dataset: GtfsDatasetRecord, locale?: string): string {
  const parts = [formatStatusLabel(dataset.status), formatConsoleDateTime(dataset.createdAt, locale)];
  const warningCount = dataset.validationSummary["warningCount"];

  if (typeof warningCount === "number") {
    parts.push(`${warningCount} warnings`);
  }

  if (dataset.previousDatasetId) {
    parts.push("has previous version");
  }

  return parts.join(" � ");
}

function formatStatusLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatTripTitle(trip: GtfsTripCatalogRecord): string {
  return trip.headsign ?? trip.shortName ?? trip.externalTripId;
}

function jobTone(status: GtfsImportJobRecord["status"]): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (status) {
    case "succeeded":
      return "good";
    case "failed":
      return "critical";
    case "running":
      return "accent";
    case "queued":
      return "neutral";
    case "cancelled":
      return "warn";
    default:
      return "neutral";
  }
}

function pickSelectedDatasetId(datasets: GtfsDatasetRecord[], preferredDatasetId: string | null | undefined, activeDatasetId: string | null): string | null {
  if (preferredDatasetId && datasets.some((dataset) => dataset.id === preferredDatasetId)) {
    return preferredDatasetId;
  }

  if (activeDatasetId && datasets.some((dataset) => dataset.id === activeDatasetId)) {
    return activeDatasetId;
  }

  return datasets[0]?.id ?? null;
}

function pickSelectedJobId(jobs: GtfsImportJobRecord[], preferredJobId: string | null | undefined): string | null {
  if (preferredJobId && jobs.some((job) => job.id === preferredJobId)) {
    return preferredJobId;
  }

  const prioritizedJob = jobs.find((job) => job.status === "failed" || job.validationErrorCount > 0 || job.warningCount > 0);
  return prioritizedJob?.id ?? jobs[0]?.id ?? null;
}

function pickSelectedTripId(trips: GtfsTripCatalogRecord[], preferredTripId: string | null | undefined): string | null {
  if (preferredTripId && trips.some((trip) => trip.id === preferredTripId)) {
    return preferredTripId;
  }

  return trips[0]?.id ?? null;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error(`Unable to read ${file.name}.`));
    };

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.readAsDataURL(file);
  });
}

function routeTypeLabel(routeType: number): string {
  switch (routeType) {
    case 0:
      return "Tram";
    case 1:
      return "Metro";
    case 2:
      return "Rail";
    case 3:
      return "Bus";
    case 4:
      return "Ferry";
    case 5:
      return "Cable tram";
    case 6:
      return "Aerial";
    case 7:
      return "Funicular";
    case 11:
      return "Trolleybus";
    case 12:
      return "Monorail";
    default:
      return `Type ${routeType}`;
  }
}

function summarizeDestinations(route: GtfsRouteCatalogRecord): string {
  const sample = route.destinationHeadsigns.slice(0, 3).join(" � ");
  return sample || "No destination labels found.";
}
