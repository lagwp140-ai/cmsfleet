import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchDisplayDomain, generateDisplayCommands } from "../admin/displayClient";
import type {
  DisplayCommandRequest,
  DisplayCommandResponse,
  DisplayDomainResponse,
  DisplaySystemStatus
} from "../admin/displayTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { DetailList, MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

interface DisplayCommandFormState {
  alternatingMessages: string;
  destination: string;
  emergencyMessage: string;
  headsign: string;
  includeInterior: boolean;
  nextStop: string;
  publicNote: string;
  routeLongName: string;
  routeShortName: string;
  serviceMessage: string;
  stopAnnouncement: string;
  systemStatus: DisplaySystemStatus | "";
  testPatternLabel: string;
  vehicleId: string;
  via: string;
}

const DISPLAY_STATUS_OPTIONS: Array<{ label: string; value: DisplaySystemStatus | "" }> = [
  { label: "Auto detect", value: "" },
  { label: "Normal", value: "normal" },
  { label: "Service message", value: "service_message" },
  { label: "Stop announcement", value: "stop_announcement" },
  { label: "Emergency", value: "emergency" },
  { label: "Test pattern", value: "test_pattern" },
  { label: "Preview", value: "preview" }
];

export function DisplaysPage() {
  const navigate = useNavigate();
  const { dashboard } = useAdminConsole();
  const { logout, user } = useAuth();
  const [domain, setDomain] = useState<DisplayDomainResponse | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState<DisplayCommandFormState>(createEmptyCommandForm());
  const [commandResult, setCommandResult] = useState<DisplayCommandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const canManageDisplays = user?.permissions?.includes("content:manage") ?? false;
  const locale = dashboard?.tenant.locale;

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadDomain = useEffectEvent(async () => {
    if (!canManageDisplays) {
      setDomain(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextDomain = await fetchDisplayDomain();
      startTransition(() => {
        setDomain(nextDomain);
        setCommandInput((current) => hydrateCommandForm(current, nextDomain));
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 403) {
        setError("Display domain controls require the content:manage permission.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load display domain model.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadDomain();
  }, [canManageDisplays]);

  function updateCommandField<K extends keyof DisplayCommandFormState>(field: K, value: DisplayCommandFormState[K]) {
    setCommandInput((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleGenerateCommands() {
    if (!canManageDisplays) {
      return;
    }

    setIsGenerating(true);
    setCommandError(null);

    try {
      const nextResult = await generateDisplayCommands(toDisplayCommandRequest(commandInput));
      startTransition(() => {
        setCommandResult(nextResult);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setCommandError(requestError instanceof Error ? requestError.message : "Unable to generate display commands.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleResetCommandForm() {
    setCommandError(null);
    setCommandResult(null);
    setCommandInput(domain ? hydrateCommandForm(createEmptyCommandForm(), domain) : createEmptyCommandForm());
  }

  const generatedPanelCount = commandResult?.payload.panels.length ?? 0;
  const activeVehicleLabel = commandResult?.payload.vehicle?.label ?? commandResult?.payload.vehicle?.vehicleCode ?? "Manual preview";

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          canManageDisplays ? (
            <>
              <button className="action-button action-button--secondary" onClick={() => void loadDomain()} type="button">
                Refresh model
              </button>
              <button className="action-button action-button--primary" disabled={isGenerating} onClick={() => void handleGenerateCommands()} type="button">
                {isGenerating ? "Generating..." : "Generate commands"}
              </button>
            </>
          ) : undefined
        }
        description="Keep LED behavior in a clean display domain with mode-specific templates, abstract publish envelopes, preview-safe rendering, and driver-ready structured panel commands that stay independent from hardware protocol details."
        eyebrow="Display Domain"
        title="Displays"
      />

      {!canManageDisplays ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can open the admin shell, but display authoring and preview tools require the content:manage permission.`}
          title="Display control restricted"
          tone="warn"
        />
      ) : null}

      {error ? <Notice body={error} title="Display domain unavailable" tone="critical" /> : null}
      {commandError ? <Notice body={commandError} title="Display command generation failed" tone="critical" /> : null}

      <section className="metric-grid">
        <MetricCard detail="Configured display modes available to the CMS core regardless of controller family." label="Supported modes" tone="accent" value={String(domain?.supportedModes.length ?? 0).padStart(2, "0")} />
        <MetricCard detail="Line capacity advertised by the active message format." label="Line format" tone="good" value={domain ? `${domain.profile.messageFormat.lineCount}L x ${domain.profile.messageFormat.maxCharactersPerLine}` : "--"} />
        <MetricCard detail="Controller operations exposed through the abstract publish envelope." label="Driver ops" tone="good" value={String(domain?.profile.controllerContract.supportedOperations.length ?? 0).padStart(2, "0")} />
        <MetricCard detail="Structured commands currently rendered for the latest preview or live vehicle request." label="Panel commands" tone="neutral" value={String(generatedPanelCount).padStart(2, "0")} />
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="The active display profile, controller contract, and render format that later hardware drivers must honor." title="Profile contract">
          {isLoading ? (
            <div className="empty-state">Loading display profile...</div>
          ) : domain ? (
            <DetailList rows={buildProfileRows(domain)} />
          ) : (
            <div className="empty-state">Display domain data is not available.</div>
          )}
        </Panel>

        <Panel description="Why the display layer stays abstracted from transport logic and vendor-specific controller commands." title="Abstraction posture">
          {isLoading ? (
            <div className="empty-state">Loading abstraction notes...</div>
          ) : domain ? (
            <div className="detail-list">
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Driver status</div>
                  <div className="detail-row__meta">Controller-specific protocols are intentionally kept behind a neutral publish envelope.</div>
                </div>
                <span className="tone-pill tone-pill--accent">{domain.abstraction.driverStatus}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Envelope kind</div>
                  <div className="detail-row__meta">The contract future adapters consume when they translate preview or publish intent to hardware commands.</div>
                </div>
                <span className="tone-pill tone-pill--good">{domain.abstraction.publishEnvelopeKind}</span>
              </div>
              {domain.abstraction.notes.map((note) => (
                <div className="detail-row" key={note}>
                  <div>
                    <div className="detail-row__label">Design note</div>
                    <div className="detail-row__meta">{note}</div>
                  </div>
                  <span className="tone-pill tone-pill--neutral">Model</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No abstraction notes available.</div>
          )}
        </Panel>
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="Generate driver-neutral commands from a live vehicle lookup or manual route and message overrides. Leave vehicle ID blank to use preview profile defaults." title="Command workbench">
          <form className="form-grid" onSubmit={(event) => {
            event.preventDefault();
            void handleGenerateCommands();
          }}>
            <label className="field field--wide">
              <span className="field__label">Vehicle ID or vehicle code</span>
              <input className="input-control" onChange={(event) => updateCommandField("vehicleId", event.currentTarget.value)} placeholder="BUS-102 or UUID" type="text" value={commandInput.vehicleId} />
              <span className="helper-text">When provided, the backend pulls active route, trip, and next-stop context from the operational model first.</span>
            </label>
            <label className="field">
              <span className="field__label">System status</span>
              <select className="select-control" onChange={(event) => updateCommandField("systemStatus", event.currentTarget.value as DisplaySystemStatus | "")} value={commandInput.systemStatus}>
                {DISPLAY_STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Route number</span>
              <input className="input-control" onChange={(event) => updateCommandField("routeShortName", event.currentTarget.value)} type="text" value={commandInput.routeShortName} />
            </label>
            <label className="field field--wide">
              <span className="field__label">Route long name</span>
              <input className="input-control" onChange={(event) => updateCommandField("routeLongName", event.currentTarget.value)} type="text" value={commandInput.routeLongName} />
            </label>
            <label className="field">
              <span className="field__label">Headsign</span>
              <input className="input-control" onChange={(event) => updateCommandField("headsign", event.currentTarget.value)} type="text" value={commandInput.headsign} />
            </label>
            <label className="field">
              <span className="field__label">Destination</span>
              <input className="input-control" onChange={(event) => updateCommandField("destination", event.currentTarget.value)} type="text" value={commandInput.destination} />
            </label>
            <label className="field">
              <span className="field__label">Via</span>
              <input className="input-control" onChange={(event) => updateCommandField("via", event.currentTarget.value)} type="text" value={commandInput.via} />
            </label>
            <label className="field">
              <span className="field__label">Next stop</span>
              <input className="input-control" onChange={(event) => updateCommandField("nextStop", event.currentTarget.value)} type="text" value={commandInput.nextStop} />
            </label>
            <label className="field field--wide">
              <span className="field__label">Service message</span>
              <input className="input-control" onChange={(event) => updateCommandField("serviceMessage", event.currentTarget.value)} type="text" value={commandInput.serviceMessage} />
            </label>
            <label className="field field--wide">
              <span className="field__label">Alternating messages</span>
              <textarea className="input-control" onChange={(event) => updateCommandField("alternatingMessages", event.currentTarget.value)} placeholder="One message per line" rows={4} style={textAreaStyle} value={commandInput.alternatingMessages} />
              <span className="helper-text">Each non-empty line becomes one additional frame in the generated alternating sequence.</span>
            </label>
            <label className="field field--wide">
              <span className="field__label">Stop announcement</span>
              <input className="input-control" onChange={(event) => updateCommandField("stopAnnouncement", event.currentTarget.value)} type="text" value={commandInput.stopAnnouncement} />
            </label>
            <label className="field field--wide">
              <span className="field__label">Emergency message</span>
              <input className="input-control" onChange={(event) => updateCommandField("emergencyMessage", event.currentTarget.value)} type="text" value={commandInput.emergencyMessage} />
            </label>
            <label className="field">
              <span className="field__label">Test pattern label</span>
              <input className="input-control" onChange={(event) => updateCommandField("testPatternLabel", event.currentTarget.value)} type="text" value={commandInput.testPatternLabel} />
            </label>
            <label className="field">
              <span className="field__label">Public note</span>
              <input className="input-control" onChange={(event) => updateCommandField("publicNote", event.currentTarget.value)} type="text" value={commandInput.publicNote} />
            </label>
            <div className="checkbox-row field--wide">
              <label className="checkbox-pill">
                <input checked={commandInput.includeInterior} onChange={(event) => updateCommandField("includeInterior", event.currentTarget.checked)} type="checkbox" />
                <span>Include interior display command</span>
              </label>
            </div>
            <div className="inline-form-actions field--wide">
              <button className="action-button action-button--primary" disabled={isGenerating} type="submit">
                {isGenerating ? "Generating..." : "Generate payload"}
              </button>
              <button className="action-button action-button--secondary" onClick={handleResetCommandForm} type="button">
                Reset form
              </button>
            </div>
          </form>
        </Panel>

        <Panel description="Review the normalized context and per-panel command behavior before a future hardware adapter publishes anything to a physical controller." title="Generated command payload">
          {!commandResult ? (
            <div className="empty-state">Generate a command set to inspect front, side, rear, and optional interior display output.</div>
          ) : (
            <div className="detail-list">
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Vehicle context</div>
                  <div className="detail-row__meta">Source {formatModeLabel(commandResult.context.source)} with system status {formatModeLabel(commandResult.payload.systemStatus)}.</div>
                </div>
                <span className="tone-pill tone-pill--accent">{activeVehicleLabel}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Provider / transport</div>
                  <div className="detail-row__meta">Payload remains protocol-neutral and suitable for later Teltonika-adjacent or other LED driver adapters.</div>
                </div>
                <span className="tone-pill tone-pill--good">{commandResult.payload.provider} / {commandResult.payload.transport}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Resolved headsign</div>
                  <div className="detail-row__meta">Final destination tokens after route, trip, and fallback normalization.</div>
                </div>
                <span className="tone-pill tone-pill--neutral">{commandResult.context.headsign}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Generated</div>
                  <div className="detail-row__meta">The command timestamp and brightness target future drivers should honor.</div>
                </div>
                <span className="tone-pill tone-pill--neutral">{formatGeneratedAt(commandResult.payload.generatedAt, locale)} � {commandResult.payload.brightness}%</span>
              </div>
            </div>
          )}
        </Panel>
      </section>

      <Panel description="One structured command per panel with transport intent, mode, behavior, and pre-rendered frames that a controller-specific driver can translate later." title="Panel commands">
        {!commandResult ? (
          <div className="empty-state">No panel commands generated yet.</div>
        ) : (
          <div className="registry-grid">
            {commandResult.payload.panels.map((panel) => (
              <article className="registry-card" key={panel.panel}>
                <div className="registry-card__header">
                  <div>
                    <div className="registry-card__eyebrow">{panel.panel}</div>
                    <h3 className="registry-card__title">{formatModeLabel(panel.intent)}</h3>
                    <div className="registry-card__subtext">{formatModeLabel(panel.mode)} mode � {formatModeLabel(panel.behavior)} behavior</div>
                  </div>
                  <div className="badge-row">
                    <span className="tone-pill tone-pill--accent">{panel.frames.length} frames</span>
                  </div>
                </div>
                <div className="registry-card__specs">
                  {panel.frames.map((frame, index) => (
                    <div className="registry-card__spec" key={`${panel.panel}-${index}`}>
                      <span>Frame {index + 1}</span>
                      <strong>{frame.durationSeconds}s � {frame.text}</strong>
                    </div>
                  ))}
                  <div className="registry-card__spec">
                    <span>Preview text</span>
                    <strong>{panel.previewText}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel description="Mode-specific policies and templates for route, destination, service-message, emergency, and preview behavior." title="Mode policies">
        {isLoading ? (
          <div className="empty-state">Loading display modes...</div>
        ) : !domain || domain.modes.length === 0 ? (
          <div className="empty-state">No display modes are configured.</div>
        ) : (
          <div className="registry-grid">
            {domain.modes.map((mode) => (
              <article className="registry-card" key={mode.mode}>
                <div className="registry-card__header">
                  <div>
                    <div className="registry-card__eyebrow">{formatModeLabel(mode.mode)}</div>
                    <h3 className="registry-card__title">{mode.templates.front}</h3>
                    <div className="registry-card__subtext">{mode.description}</div>
                  </div>
                  <div className="badge-row">
                    <span className="tone-pill tone-pill--accent">{Object.keys(mode.templates).length} surfaces</span>
                    <span className="tone-pill tone-pill--neutral">{Object.keys(mode.policy).length} policy fields</span>
                  </div>
                </div>
                <div className="registry-card__specs">
                  {Object.entries(mode.templates).map(([surface, template]) => (
                    <div className="registry-card__spec" key={`${mode.mode}-${surface}`}>
                      <span>{surface}</span>
                      <strong>{template}</strong>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel description="Preview rendering uses sample route and message tokens from the active display profile, then produces an abstract publish envelope instead of a device-specific command stream." title="Rendered previews">
        {isLoading ? (
          <div className="empty-state">Rendering previews...</div>
        ) : !domain || domain.previews.length === 0 ? (
          <div className="empty-state">No preview scenarios are configured.</div>
        ) : (
          <div className="registry-grid">
            {domain.previews.map((preview) => (
              <article className="registry-card" key={preview.mode}>
                <div className="registry-card__header">
                  <div>
                    <div className="registry-card__eyebrow">{formatModeLabel(preview.mode)}</div>
                    <h3 className="registry-card__title">{preview.envelope.provider} over {preview.envelope.transport}</h3>
                    <div className="registry-card__subtext">Envelope {preview.envelope.contractVersion} � {formatPreviewTime(locale)}</div>
                  </div>
                  <div className="badge-row">
                    <span className="tone-pill tone-pill--good">{preview.envelope.operations.join(", ")}</span>
                  </div>
                </div>
                <div className="registry-card__specs">
                  {preview.surfaces.map((surface) => (
                    <div className="registry-card__spec" key={`${preview.mode}-${surface.surface}`}>
                      <span>{surface.surface}</span>
                      <strong>{surface.text}</strong>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel description="The raw JSON payload is available for adapter development, driver contract testing, and future publish pipeline verification." title="Raw payload">
        {!commandResult ? (
          <div className="empty-state">Generate commands to inspect the raw payload contract.</div>
        ) : (
          <pre style={payloadStyle}>{JSON.stringify(commandResult.payload, null, 2)}</pre>
        )}
      </Panel>
    </div>
  );
}

function buildProfileRows(domain: DisplayDomainResponse) {
  return [
    {
      label: "Profile",
      meta: "Configuration-driven display profile active for this deployment.",
      tone: "accent" as const,
      value: domain.profile.profileId
    },
    {
      label: "Provider / Controller",
      meta: "Provider family stays separate from transport and route logic.",
      tone: "good" as const,
      value: `${domain.profile.provider} / ${domain.profile.controller}`
    },
    {
      label: "Message format",
      meta: "Field hardware capabilities exposed as format metadata instead of hard-coded UI rules.",
      tone: "neutral" as const,
      value: `${domain.profile.messageFormat.name} � ${domain.profile.messageFormat.encoding}`
    },
    {
      label: "Mapped surfaces",
      meta: "The CMS decides intent per surface before any controller-specific driver runs.",
      tone: "accent" as const,
      value: Object.entries(domain.profile.mappings).map(([surface, mode]) => `${surface}:${mode}`).join(" | ")
    }
  ];
}

function createEmptyCommandForm(): DisplayCommandFormState {
  return {
    alternatingMessages: "",
    destination: "",
    emergencyMessage: "",
    headsign: "",
    includeInterior: false,
    nextStop: "",
    publicNote: "",
    routeLongName: "",
    routeShortName: "",
    serviceMessage: "",
    stopAnnouncement: "",
    systemStatus: "",
    testPatternLabel: "",
    vehicleId: "",
    via: ""
  };
}

function formatGeneratedAt(timestamp: string, locale?: string): string {
  return new Date(timestamp).toLocaleString(locale ?? undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function formatModeLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatPreviewTime(locale?: string): string {
  return new Date().toLocaleTimeString(locale ?? undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function hydrateCommandForm(current: DisplayCommandFormState, domain: DisplayDomainResponse): DisplayCommandFormState {
  const preview = domain.previewContext;

  return {
    ...current,
    destination: current.destination || preview.destination,
    emergencyMessage: current.emergencyMessage || preview.emergencyMessage,
    headsign: current.headsign || preview.headsign,
    nextStop: current.nextStop || preview.nextStop,
    publicNote: current.publicNote || preview.publicNote,
    routeLongName: current.routeLongName || preview.routeLongName,
    routeShortName: current.routeShortName || preview.routeShortName,
    serviceMessage: current.serviceMessage || preview.serviceMessage,
    via: current.via || preview.via
  };
}

function splitAlternatingMessages(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function toDisplayCommandRequest(input: DisplayCommandFormState): DisplayCommandRequest {
  const alternatingMessages = splitAlternatingMessages(input.alternatingMessages);

  return {
    alternatingMessages: alternatingMessages.length > 0 ? alternatingMessages : undefined,
    destination: emptyToUndefined(input.destination),
    emergencyMessage: emptyToUndefined(input.emergencyMessage),
    headsign: emptyToUndefined(input.headsign),
    includeInterior: input.includeInterior,
    nextStop: emptyToUndefined(input.nextStop),
    publicNote: emptyToUndefined(input.publicNote),
    routeLongName: emptyToUndefined(input.routeLongName),
    routeShortName: emptyToUndefined(input.routeShortName),
    serviceMessage: emptyToUndefined(input.serviceMessage),
    stopAnnouncement: emptyToUndefined(input.stopAnnouncement),
    systemStatus: input.systemStatus || undefined,
    testPatternLabel: emptyToUndefined(input.testPatternLabel),
    vehicleId: emptyToUndefined(input.vehicleId),
    via: emptyToUndefined(input.via)
  };
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const payloadStyle = {
  background: "#0f1b27",
  border: "1px solid #23384a",
  borderRadius: "18px",
  color: "#dce7f1",
  margin: 0,
  overflowX: "auto",
  padding: "16px",
  whiteSpace: "pre-wrap"
} as const;

const textAreaStyle = {
  minHeight: "112px",
  resize: "vertical"
} as const;


