import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  activateGtfsDataset,
  fetchGtfsErrors,
  fetchGtfsOverview,
  importGtfsFromPath,
  importGtfsUpload,
  rollbackGtfsDataset
} from "../admin/gtfsClient";
import type {
  GtfsDatasetRecord,
  GtfsImportErrorRecord,
  GtfsImportJobRecord,
  GtfsOverviewResponse
} from "../admin/gtfsTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

export function GtfsPage() {
  const navigate = useNavigate();
  const { dashboard, refreshConsole } = useAdminConsole();
  const { logout, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<GtfsImportErrorRecord[]>([]);
  const [feedback, setFeedback] = useState<{ body: string; title: string; tone: "critical" | "good" | "warn" } | null>(null);
  const [isErrorsLoading, setIsErrorsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const [localPathActivateOnSuccess, setLocalPathActivateOnSuccess] = useState(false);
  const [localPathDatasetLabel, setLocalPathDatasetLabel] = useState("");
  const [overview, setOverview] = useState<GtfsOverviewResponse | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [uploadActivateOnSuccess, setUploadActivateOnSuccess] = useState(true);
  const [uploadDatasetLabel, setUploadDatasetLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const canManageGtfs = user?.permissions.includes("dispatch:manage") ?? false;
  const locale = dashboard?.tenant.locale;
  const jobs = overview?.jobs ?? [];
  const datasets = overview?.datasets ?? [];
  const activeDataset = overview?.activeDataset ?? null;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const pendingActivationCount = datasets.filter((dataset) => !dataset.isActive).length;
  const totalValidationIssues = jobs.reduce((sum, job) => sum + job.validationErrorCount + job.warningCount, 0);

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadOverview = useEffectEvent(async (preferredJobId?: string | null) => {
    if (!canManageGtfs) {
      setIsLoading(false);
      setOverview(null);
      setSelectedJobId(null);
      setErrors([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextOverview = await fetchGtfsOverview();
      const nextSelectedJobId = pickSelectedJobId(nextOverview.jobs, preferredJobId ?? selectedJobId);

      startTransition(() => {
        setOverview(nextOverview);
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

  useEffect(() => {
    void loadOverview();
  }, [canManageGtfs]);

  useEffect(() => {
    void loadErrors(selectedJob);
  }, [canManageGtfs, selectedJob?.id, selectedJob?.status, selectedJob?.validationErrorCount, selectedJob?.warningCount]);

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

      await loadOverview(result.jobId);
      await refreshConsole();
      setFeedback({
        body: result.status === "succeeded"
          ? localPathActivateOnSuccess
            ? "The GTFS package was imported, validated, and activated for live route usage."
            : "The GTFS package was imported and staged as a selectable dataset."
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

      await loadOverview(result.jobId);
      await refreshConsole();
      setFeedback({
        body: result.status === "succeeded"
          ? uploadActivateOnSuccess
            ? "The uploaded feed validated successfully and is now the active dataset."
            : "The uploaded feed validated successfully and is ready for manual activation."
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

      await loadOverview();
      await refreshConsole();
      setFeedback({
        body: rollback
          ? `${dataset.datasetLabel} is now restored as the active GTFS dataset.`
          : `${dataset.datasetLabel} is now the active GTFS dataset for route and trip lookups.`,
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
        description="Import, validate, stage, activate, and roll back GTFS datasets without losing prior versions. This view is structured around operational feed control and future scheduled sync support."
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
                <span className="helper-text">Remote URL sync and scheduled refresh are reserved for the next ingestion adapter, but they will reuse this same dataset and activation model.</span>
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
                  <div className="detail-row__label">Version preservation</div>
                  <div className="detail-row__meta">Previous datasets remain available for rollback instead of being overwritten by newer imports.</div>
                </div>
                <span className="tone-pill tone-pill--accent">Enabled</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Scheduled sync</div>
                  <div className="detail-row__meta">Manual triggers are live now, and the import service boundary is ready for later scheduled or remote URL adapters.</div>
                </div>
                <span className="tone-pill tone-pill--warn">Planned next</span>
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
                    <article className={`registry-card${selectedJob?.datasetId === dataset.id ? " registry-card--selected" : ""}`} key={dataset.id}>
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
                        <div className="registry-card__spec"><span>Activated</span><strong>{dataset.activatedAt ? formatConsoleTime(dataset.activatedAt, locale) : "Not active"}</strong></div>
                        <div className="registry-card__spec"><span>Source</span><strong>{dataset.sourceUri ?? dataset.sourceType}</strong></div>
                      </div>
                      <div className="registry-card__actions">
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
                      <span>{formatConsoleTime(job.createdAt, locale)}</span>
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
                      <span>{formatConsoleTime(item.createdAt, locale)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function formatConsoleTime(timestamp: string, locale?: string): string {
  return new Date(timestamp).toLocaleString(locale ?? undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function formatDatasetMeta(dataset: GtfsDatasetRecord, locale?: string): string {
  const parts = [formatStatusLabel(dataset.status), formatConsoleTime(dataset.createdAt, locale)];
  const warningCount = dataset.validationSummary["warningCount"];

  if (typeof warningCount === "number") {
    parts.push(`${warningCount} warnings`);
  }

  if (dataset.previousDatasetId) {
    parts.push("has previous version");
  }

  return parts.join(" · ");
}

function formatStatusLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
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

function pickSelectedJobId(jobs: GtfsImportJobRecord[], preferredJobId: string | null | undefined): string | null {
  if (preferredJobId && jobs.some((job) => job.id === preferredJobId)) {
    return preferredJobId;
  }

  const prioritizedJob = jobs.find((job) => job.status === "failed" || job.validationErrorCount > 0 || job.warningCount > 0);
  return prioritizedJob?.id ?? jobs[0]?.id ?? null;
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




