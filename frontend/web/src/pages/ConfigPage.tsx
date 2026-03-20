import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  applyConfigScope,
  fetchConfigDiff,
  fetchConfigOverview,
  fetchConfigScope,
  rollbackConfigScope,
  validateConfigScope
} from "../admin/configClient";
import type {
  ConfigDiffResult,
  ConfigOverviewResponse,
  ConfigScopeSummary,
  ConfigScopeType,
  ConfigValidationResponse,
  ConfigVersionDiffResponse,
  ConfigVersionRecord
} from "../admin/configTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";
import { formatConsoleDateTime } from "../lib/time";

interface ConfigScopeState {
  activeVersion: ConfigVersionRecord | null;
  diffFromRuntime: ConfigDiffResult;
  diskEffective: Record<string, unknown>;
  history: ConfigVersionRecord[];
  payload: Record<string, unknown>;
  runtimeEffective: Record<string, unknown>;
  runtimeState: "in_sync" | "restart_required";
  scope: Omit<ConfigScopeSummary, "activeVersionId" | "activeVersionNumber" | "lastPublishedAt">;
}

export function ConfigPage() {
  const navigate = useNavigate();
  const { dashboard, refreshConsole } = useAdminConsole();
  const { logout, user } = useAuth();
  const [changeSummary, setChangeSummary] = useState("");
  const [diffResult, setDiffResult] = useState<ConfigVersionDiffResponse | null>(null);
  const [draftText, setDraftText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ body: string; tone: "critical" | "good" | "warn"; title: string } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [overview, setOverview] = useState<ConfigOverviewResponse | null>(null);
  const [scopeState, setScopeState] = useState<ConfigScopeState | null>(null);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ConfigValidationResponse | null>(null);

  const canManageConfig = user?.permissions.includes("users:manage") ?? false;
  const locale = dashboard?.tenant.locale;

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadScope = useEffectEvent(async (scopeType: ConfigScopeType, scopeKey: string) => {
    const nextScope = await fetchConfigScope(scopeType, scopeKey);

    startTransition(() => {
      setScopeState(nextScope);
      setDraftText(JSON.stringify(nextScope.payload, null, 2));
      setValidationResult(null);
      setDiffResult(null);
    });
  });

  const loadConfigPage = useEffectEvent(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextOverview = await fetchConfigOverview();
      const nextSelectedScope = resolveSelectedScope(nextOverview.scopes, selectedScopeId);

      if (!nextSelectedScope) {
        startTransition(() => {
          setOverview(nextOverview);
          setScopeState(null);
          setSelectedScopeId(null);
          setDraftText("");
        });
        return;
      }

      const nextScope = await fetchConfigScope(nextSelectedScope.scopeType, nextSelectedScope.scopeKey);

      startTransition(() => {
        setOverview(nextOverview);
        setScopeState(nextScope);
        setSelectedScopeId(toScopeId(nextSelectedScope.scopeType, nextSelectedScope.scopeKey));
        setDraftText(JSON.stringify(nextScope.payload, null, 2));
        setValidationResult(null);
        setDiffResult(null);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load configuration management.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadConfigPage();
  }, [user?.id]);

  async function handleSelectScope(scope: ConfigScopeSummary) {
    setIsLoading(true);
    setError(null);

    try {
      await loadScope(scope.scopeType, scope.scopeKey);
      setSelectedScopeId(toScopeId(scope.scopeType, scope.scopeKey));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load configuration scope.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleValidate() {
    if (!scopeState || !canManageConfig) {
      return;
    }

    let payload: Record<string, unknown>;

    try {
      payload = parseDraft(draftText);
    } catch (parseError) {
      setFeedback({
        body: parseError instanceof Error ? parseError.message : "Configuration draft must be valid JSON.",
        title: "Draft JSON needs attention",
        tone: "critical"
      });
      return;
    }

    setIsValidating(true);
    setFeedback(null);
    setError(null);

    try {
      const nextValidation = await validateConfigScope({
        payload,
        scopeKey: scopeState.scope.scopeKey,
        scopeType: scopeState.scope.scopeType
      });

      startTransition(() => {
        setValidationResult(nextValidation);
        setDiffResult(null);
        setFeedback({
          body: `Validated ${nextValidation.diff.changeCount} configuration change(s) for ${scopeState.scope.title.toLowerCase()}.`,
          title: "Configuration draft is valid",
          tone: "good"
        });
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to validate configuration.");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleApply() {
    if (!scopeState || !canManageConfig) {
      return;
    }

    let payload: Record<string, unknown>;

    try {
      payload = parseDraft(draftText);
    } catch (parseError) {
      setFeedback({
        body: parseError instanceof Error ? parseError.message : "Configuration draft must be valid JSON.",
        title: "Draft JSON needs attention",
        tone: "critical"
      });
      return;
    }

    setIsApplying(true);
    setFeedback(null);
    setError(null);

    try {
      const result = await applyConfigScope({
        changeSummary: changeSummary.trim() || undefined,
        payload,
        scopeKey: scopeState.scope.scopeKey,
        scopeType: scopeState.scope.scopeType
      });

      await Promise.all([refreshConsole(), loadConfigPage()]);

      startTransition(() => {
        setValidationResult(result);
        setDiffResult(null);
        setChangeSummary("");
        setFeedback({
          body: result.runtimeState === "restart_required"
            ? "Changes were written to disk, versioned, and will take effect after the backend reloads its runtime configuration."
            : "Changes were written to disk, versioned, and match the currently running configuration state.",
          title: "Configuration applied",
          tone: result.runtimeState === "restart_required" ? "warn" : "good"
        });
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to apply configuration changes.");
    } finally {
      setIsApplying(false);
    }
  }

  async function handleCompareVersion(version: ConfigVersionRecord) {
    if (!scopeState || !scopeState.activeVersion) {
      return;
    }

    setIsComparing(true);
    setError(null);
    setFeedback(null);

    try {
      const result = await fetchConfigDiff({
        fromVersionId: version.id,
        scopeKey: scopeState.scope.scopeKey,
        scopeType: scopeState.scope.scopeType,
        toVersionId: scopeState.activeVersion.id
      });

      startTransition(() => {
        setDiffResult(result);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to compare configuration versions.");
    } finally {
      setIsComparing(false);
    }
  }

  async function handleRollback(version: ConfigVersionRecord) {
    if (!scopeState || !canManageConfig) {
      return;
    }

    setIsApplying(true);
    setError(null);
    setFeedback(null);

    try {
      const result = await rollbackConfigScope({
        changeSummary: changeSummary.trim() || undefined,
        scopeKey: scopeState.scope.scopeKey,
        scopeType: scopeState.scope.scopeType,
        versionId: version.id
      });

      await Promise.all([refreshConsole(), loadConfigPage()]);

      startTransition(() => {
        setValidationResult(result);
        setDiffResult(null);
        setChangeSummary("");
        setFeedback({
          body: `Restored ${scopeState.scope.title.toLowerCase()} from version ${version.versionNumber}.`,
          title: "Configuration rolled back",
          tone: result.runtimeState === "restart_required" ? "warn" : "good"
        });
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to roll back configuration.");
    } finally {
      setIsApplying(false);
    }
  }

  function handleResetDraft() {
    if (!scopeState) {
      return;
    }

    setDraftText(JSON.stringify(scopeState.payload, null, 2));
    setValidationResult(null);
    setDiffResult(null);
    setFeedback({
      body: `Draft reset to the current on-disk ${scopeState.scope.title.toLowerCase()} document.`,
      title: "Draft reset",
      tone: "warn"
    });
  }

  const enabledFlagCount = countEnabledFlags(overview?.diskEffective.featureFlags);
  const scopeCount = overview?.scopes.length ?? 0;
  const runtimeStateLabel = overview?.runtimeState === "restart_required" ? "Restart required" : "In sync";
  const activeVersionLabel = scopeState?.activeVersion ? `v${scopeState.activeVersion.versionNumber}` : "Untracked";

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          <button className="action-button action-button--secondary" onClick={() => void loadConfigPage()} type="button">
            {isLoading ? "Refreshing..." : "Refresh config"}
          </button>
        }
        description="Review deployment-scoped JSON configuration, validate changes before apply, compare versions, and roll back safely without changing the CMS core code."
        eyebrow="Configuration Control"
        title="Config"
      />

      {error ? <Notice body={error} title="Configuration workflow issue" tone="critical" /> : null}
      {feedback ? <Notice body={feedback.body} title={feedback.title} tone={feedback.tone} /> : null}

      {!canManageConfig ? (
        <Notice
          body="This view is read-only for your current role. You can inspect active deployment settings and version history, but applying or rolling back changes requires the users:manage permission."
          title="Controlled editing"
          tone="warn"
        />
      ) : null}

      <section className="metric-grid">
        <MetricCard detail="Editable deployment scopes currently exposed by the configuration management module." label="Managed scopes" tone="accent" value={String(scopeCount).padStart(2, "0")} />
        <MetricCard detail="Whether the JSON on disk still matches the currently running backend configuration." label="Runtime sync" tone={overview?.runtimeState === "restart_required" ? "warn" : "good"} value={runtimeStateLabel} />
        <MetricCard detail="Feature flags resolved from the active file set on disk." label="Enabled flags" tone="good" value={String(enabledFlagCount).padStart(2, "0")} />
        <MetricCard detail="Latest active version for the selected configuration scope." label="Selected version" tone="neutral" value={activeVersionLabel} />
      </section>

      <div className="split-layout">
        <div className="stack-card">
          <Panel description="The active deployment currently resolves these editable configuration scopes." title="Scopes">
            {overview && overview.scopes.length > 0 ? (
              <div className="registry-grid config-scope-grid">
                {overview.scopes.map((scope) => {
                  const isSelected = selectedScopeId === toScopeId(scope.scopeType, scope.scopeKey);

                  return (
                    <article className={`registry-card ${isSelected ? "registry-card--selected" : ""}`} key={toScopeId(scope.scopeType, scope.scopeKey)}>
                      <div className="registry-card__header">
                        <div>
                          <div className="registry-card__eyebrow">{scope.scopeType}</div>
                          <h3 className="registry-card__title">{scope.title}</h3>
                          <div className="registry-card__subtext">{scope.relativePath}</div>
                        </div>
                        <span className={`tone-pill tone-pill--${scope.activeVersionNumber ? "accent" : "neutral"}`}>
                          {scope.activeVersionNumber ? `v${scope.activeVersionNumber}` : "No version"}
                        </span>
                      </div>
                      <div className="registry-card__subtext">{scope.description}</div>
                      <div className="badge-row">
                        {scope.editableSections.map((section) => (
                          <span className="tone-pill tone-pill--neutral" key={`${scope.scopeKey}-${section}`}>{section}</span>
                        ))}
                      </div>
                      <div className="registry-card__actions">
                        <button className="action-button action-button--secondary" onClick={() => void handleSelectScope(scope)} type="button">
                          {isSelected ? "Selected" : "Open scope"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">No editable configuration scopes are available for this deployment.</div>
            )}
          </Panel>

          <Panel description="File-on-disk versus runtime status for the selected configuration scope." title="Runtime posture">
            {scopeState ? (
              <div className="detail-list">
                <div className="detail-row">
                  <div>
                    <div className="detail-row__label">Disk state</div>
                    <div className="detail-row__meta">Latest resolved JSON from the currently selected configuration files.</div>
                  </div>
                  <span className={`tone-pill tone-pill--${scopeState.runtimeState === "restart_required" ? "warn" : "good"}`}>
                    {scopeState.runtimeState === "restart_required" ? "Changed since startup" : "Matches runtime"}
                  </span>
                </div>
                <div className="detail-row">
                  <div>
                    <div className="detail-row__label">History retention</div>
                    <div className="detail-row__meta">Configuration versions stored in PostgreSQL for this scope.</div>
                  </div>
                  <span className="tone-pill tone-pill--accent">{String(scopeState.history.length).padStart(2, "0")} versions</span>
                </div>
              </div>
            ) : (
              <div className="empty-state">Select a configuration scope to inspect runtime posture.</div>
            )}
          </Panel>
        </div>

        <div className="stack-card">
          <Panel description="Edit one deployment-scoped JSON document at a time. Every apply is validated before write and recorded as a new version snapshot." title="Editor">
            {scopeState ? (
              <div className="config-editor-stack">
                <div className="form-grid">
                  <label className="field field--wide">
                    <span className="field__label">Scope</span>
                    <input className="input-control" disabled type="text" value={`${scopeState.scope.title} · ${scopeState.scope.scopeKey}`} />
                  </label>
                  <label className="field field--wide">
                    <span className="field__label">Change summary</span>
                    <input className="input-control" disabled={!canManageConfig || isApplying} onChange={(event) => setChangeSummary(event.currentTarget.value)} placeholder="Describe why this configuration change is needed" type="text" value={changeSummary} />
                  </label>
                  <label className="field field--wide">
                    <span className="field__label">JSON payload</span>
                    <textarea className="code-editor" disabled={isApplying || isValidating} onChange={(event) => setDraftText(event.currentTarget.value)} readOnly={!canManageConfig} rows={22} value={draftText} />
                  </label>
                </div>
                <div className="inline-form-actions">
                  <button className="action-button action-button--secondary" disabled={!canManageConfig || isValidating || isApplying} onClick={() => void handleValidate()} type="button">
                    {isValidating ? "Validating..." : "Validate"}
                  </button>
                  <button className="action-button action-button--primary" disabled={!canManageConfig || isApplying || isValidating} onClick={() => void handleApply()} type="button">
                    {isApplying ? "Applying..." : "Apply"}
                  </button>
                  <button className="action-button action-button--ghost" disabled={isApplying || isValidating} onClick={handleResetDraft} type="button">
                    Reset draft
                  </button>
                </div>
                <div className="helper-text">
                  Validation runs the staged file through the same configuration loader and fail-fast rules used at service startup.
                </div>
              </div>
            ) : (
              <div className="empty-state">Select a configuration scope to start reviewing or editing its JSON payload.</div>
            )}
          </Panel>

          <Panel description="Relevant resolved settings for the selected scope, shown both from the running backend and the current files on disk." title="Effective view">
            {scopeState ? (
              <div className="panel-grid panel-grid--two">
                <div className="console-panel console-panel--nested">
                  <header className="console-panel__header">
                    <div>
                      <h3 className="console-panel__title">Runtime</h3>
                      <p className="console-panel__description">What the currently running backend process is using now.</p>
                    </div>
                  </header>
                  <pre className="json-block">{formatJson(scopeState.runtimeEffective)}</pre>
                </div>
                <div className="console-panel console-panel--nested">
                  <header className="console-panel__header">
                    <div>
                      <h3 className="console-panel__title">On disk</h3>
                      <p className="console-panel__description">What the resolved configuration files currently produce.</p>
                    </div>
                  </header>
                  <pre className="json-block">{formatJson(validationResult?.diskEffective ?? scopeState.diskEffective)}</pre>
                </div>
              </div>
            ) : (
              <div className="empty-state">No scope selected.</div>
            )}
          </Panel>

          <Panel description="Diff summaries for the current draft and saved versions." title="Diffs">
            {validationResult ? (
              <div className="stack-card">
                <div className="detail-row">
                  <div>
                    <div className="detail-row__label">Draft validation diff</div>
                    <div className="detail-row__meta">Differences between the saved on-disk file and the current draft.</div>
                  </div>
                  <span className="tone-pill tone-pill--accent">{validationResult.diff.changeCount} changes</span>
                </div>
                {renderDiff(validationResult.diff)}
              </div>
            ) : diffResult ? (
              <div className="stack-card">
                <div className="detail-row">
                  <div>
                    <div className="detail-row__label">Version diff</div>
                    <div className="detail-row__meta">Comparing version {diffResult.fromVersion.versionNumber} to version {diffResult.toVersion.versionNumber}.</div>
                  </div>
                  <span className="tone-pill tone-pill--accent">{diffResult.diff.changeCount} changes</span>
                </div>
                {renderDiff(diffResult.diff)}
              </div>
            ) : scopeState ? (
              renderDiff(scopeState.diffFromRuntime)
            ) : (
              <div className="empty-state">Select a scope to inspect configuration differences.</div>
            )}
          </Panel>

          <Panel description="Version history for the selected configuration scope. Compare any saved version to the current active version or restore it as a new active snapshot." title="Version history">
            {scopeState && scopeState.history.length > 0 ? (
              <div className="history-list">
                {scopeState.history.map((version) => (
                  <article className="history-item" key={version.id}>
                    <div className="history-item__header">
                      <div>
                        <div className="history-item__title">Version {version.versionNumber}</div>
                        <div className="history-item__meta">{formatTime(version.publishedAt ?? version.createdAt, locale)} · {version.changeSummary ?? "No summary provided"}</div>
                      </div>
                      <span className={`tone-pill tone-pill--${version.isActive ? "good" : "neutral"}`}>{version.isActive ? "Active" : "Archived"}</span>
                    </div>
                    <div className="history-item__actions">
                      <button className="action-button action-button--secondary" disabled={isComparing || !scopeState.activeVersion} onClick={() => void handleCompareVersion(version)} type="button">
                        {isComparing ? "Comparing..." : "Compare"}
                      </button>
                      <button className="action-button action-button--ghost" disabled={!canManageConfig || isApplying || version.isActive} onClick={() => void handleRollback(version)} type="button">
                        Roll back
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">Version history will appear after the selected scope has been synchronized or edited.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function countEnabledFlags(value: unknown): number {
  if (!isPlainObject(value)) {
    return 0;
  }

  return Object.values(value).filter((entry) => entry === true).length;
}

function formatJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function formatPrimitive(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function formatTime(value: string | null, locale?: string): string {
  if (!value) {
    return "Unavailable";
  }

  return formatConsoleDateTime(value, locale);
}

function parseDraft(value: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Draft must be valid JSON.");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Configuration draft must be a JSON object at the top level.");
  }

  return parsed;
}

function renderDiff(diff: ConfigDiffResult) {
  if (diff.changeCount === 0) {
    return <div className="empty-state">No differences were detected for this comparison.</div>;
  }

  return (
    <div className="diff-list">
      {diff.items.map((item) => (
        <article className="diff-item" key={`${item.changeType}-${item.path}`}>
          <div className="diff-item__header">
            <strong>{item.path}</strong>
            <span className={`tone-pill tone-pill--${item.changeType === "removed" ? "critical" : item.changeType === "added" ? "good" : "warn"}`}>{item.changeType}</span>
          </div>
          <div className="diff-item__body">
            <div>
              <div className="diff-item__label">Before</div>
              <pre className="json-inline-block">{formatPrimitive(item.before)}</pre>
            </div>
            <div>
              <div className="diff-item__label">After</div>
              <pre className="json-inline-block">{formatPrimitive(item.after)}</pre>
            </div>
          </div>
        </article>
      ))}
      {diff.truncated ? <div className="helper-text">Diff output truncated to keep the page responsive.</div> : null}
    </div>
  );
}

function resolveSelectedScope(scopes: ConfigScopeSummary[], selectedScopeId: string | null): ConfigScopeSummary | null {
  if (scopes.length === 0) {
    return null;
  }

  if (!selectedScopeId) {
    return scopes[0] ?? null;
  }

  return scopes.find((scope) => toScopeId(scope.scopeType, scope.scopeKey) === selectedScopeId) ?? scopes[0] ?? null;
}

function toScopeId(scopeType: ConfigScopeType, scopeKey: string): string {
  return `${scopeType}:${scopeKey}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}



