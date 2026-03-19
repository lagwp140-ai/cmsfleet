import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createVehicle,
  deleteVehicle,
  fetchVehicleCatalog,
  fetchVehicles,
  updateVehicle
} from "../admin/vehicleClient";
import type {
  RouteOption,
  VehicleCatalogResponse,
  VehicleMutationInput,
  VehicleRecord
} from "../admin/vehicleTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

type EditorMode = "create" | "edit";

export function VehiclesPage() {
  const navigate = useNavigate();
  const { dashboard, refreshConsole } = useAdminConsole();
  const { logout, user } = useAuth();
  const [catalog, setCatalog] = useState<VehicleCatalogResponse | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ body: string; tone: "critical" | "good" | "warn"; title: string } | null>(null);
  const [formState, setFormState] = useState<VehicleMutationInput | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);

  const canManageVehicles = user?.permissions.includes("fleet:manage") ?? false;
  const enabledCount = vehicles.filter((vehicle) => vehicle.isEnabled).length;
  const activeCount = vehicles.filter((vehicle) => vehicle.operationalStatus === "active").length;
  const manualOverrideCount = vehicles.filter((vehicle) => vehicle.routeOverrideMode === "manual").length;
  const fullyProfiledCount = vehicles.filter((vehicle) => vehicle.deviceProfile && vehicle.displayProfile).length;
  const locale = dashboard?.tenant.locale;

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadVehicleScreen = useEffectEvent(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextVehicles, nextCatalog] = await Promise.all([fetchVehicles(), fetchVehicleCatalog()]);
      const sortedVehicles = sortVehicleRecords(nextVehicles);

      startTransition(() => {
        setCatalog(nextCatalog);
        setVehicles(sortedVehicles);

        if (sortedVehicles.length === 0) {
          setEditorMode("create");
          setSelectedVehicleId(null);
          setFormState(createEmptyVehicleForm(nextCatalog));
          return;
        }

        const nextSelectedVehicle =
          selectedVehicleId !== null ? sortedVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? sortedVehicles[0] : sortedVehicles[0];

        setEditorMode("edit");
        setSelectedVehicleId(nextSelectedVehicle.id);
        setFormState(toVehicleMutationInput(nextSelectedVehicle));
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load the vehicle registry.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadVehicleScreen();
  }, [loadVehicleScreen, user?.id]);

  function handleSelectVehicle(vehicle: VehicleRecord) {
    setEditorMode("edit");
    setSelectedVehicleId(vehicle.id);
    setFormState(toVehicleMutationInput(vehicle));
    setFeedback(null);
    setError(null);
  }

  function handleStartCreate() {
    if (!catalog || !canManageVehicles) {
      return;
    }

    setEditorMode("create");
    setSelectedVehicleId(null);
    setFormState(createEmptyVehicleForm(catalog));
    setFeedback(null);
    setError(null);
  }

  function updateForm<K extends keyof VehicleMutationInput>(field: K, value: VehicleMutationInput[K]) {
    setFormState((current) => {
      if (!current) {
        return current;
      }

      if (field === "routeOverrideMode") {
        return {
          ...current,
          manualRouteId: value === "manual" ? current.manualRouteId ?? (catalog?.routes[0]?.id ?? null) : null,
          routeOverrideMode: value as VehicleMutationInput["routeOverrideMode"]
        };
      }

      if (field === "manualRouteId") {
        return {
          ...current,
          manualRouteId: value as VehicleMutationInput["manualRouteId"],
          routeOverrideMode: value ? "manual" : current.routeOverrideMode
        };
      }

      return {
        ...current,
        [field]: value
      };
    });
  }

  async function handleSubmit() {
    if (!formState) {
      return;
    }

    const validationError = validateVehicleForm(formState);

    if (validationError) {
      setFeedback({ body: validationError, title: "Vehicle form needs attention", tone: "critical" });
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const savedVehicle =
        editorMode === "create"
          ? await createVehicle(formState)
          : await updateVehicle(selectedVehicleId as string, formState);
      const nextVehicles =
        editorMode === "create"
          ? sortVehicleRecords([...vehicles, savedVehicle])
          : sortVehicleRecords(vehicles.map((vehicle) => (vehicle.id === savedVehicle.id ? savedVehicle : vehicle)));

      startTransition(() => {
        setVehicles(nextVehicles);
        setEditorMode("edit");
        setSelectedVehicleId(savedVehicle.id);
        setFormState(toVehicleMutationInput(savedVehicle));
        setFeedback({
          body:
            editorMode === "create"
              ? `${savedVehicle.label} is now available for assignment and route overrides.`
              : `${savedVehicle.label} has been updated in the fleet registry.`,
          title: editorMode === "create" ? "Vehicle registered" : "Vehicle updated",
          tone: "good"
        });
      });

      void refreshConsole();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to save the vehicle.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleEnabled(vehicle: VehicleRecord) {
    if (!canManageVehicles) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const savedVehicle = await updateVehicle(vehicle.id, {
        ...toVehicleMutationInput(vehicle),
        isEnabled: !vehicle.isEnabled
      });
      const nextVehicles = sortVehicleRecords(vehicles.map((item) => (item.id === savedVehicle.id ? savedVehicle : item)));

      startTransition(() => {
        setVehicles(nextVehicles);

        if (selectedVehicleId === savedVehicle.id) {
          setFormState(toVehicleMutationInput(savedVehicle));
        }

        setFeedback({
          body: `${savedVehicle.label} is now ${savedVehicle.isEnabled ? "enabled" : "disabled"} for operations.`,
          title: "Vehicle availability updated",
          tone: savedVehicle.isEnabled ? "good" : "warn"
        });
      });

      void refreshConsole();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to update vehicle status.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedVehicleId || !canManageVehicles) {
      return;
    }

    const vehicle = vehicles.find((item) => item.id === selectedVehicleId);

    if (!vehicle || !window.confirm(`Delete vehicle ${vehicle.vehicleCode} (${vehicle.label})?`)) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setFeedback(null);

    try {
      await deleteVehicle(vehicle.id);
      const nextVehicles = vehicles.filter((item) => item.id !== vehicle.id);
      const nextSelectedVehicle = nextVehicles[0] ?? null;

      startTransition(() => {
        setVehicles(nextVehicles);
        setFeedback({ body: `${vehicle.label} has been removed from the fleet registry.`, title: "Vehicle deleted", tone: "warn" });

        if (nextSelectedVehicle && catalog) {
          setEditorMode("edit");
          setSelectedVehicleId(nextSelectedVehicle.id);
          setFormState(toVehicleMutationInput(nextSelectedVehicle));
          return;
        }

        if (catalog) {
          setEditorMode("create");
          setSelectedVehicleId(null);
          setFormState(createEmptyVehicleForm(catalog));
        }
      });

      void refreshConsole();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to delete the vehicle.");
    } finally {
      setIsDeleting(false);
    }
  }

  const selectedTransportProfile = catalog?.transportProfiles.find((profile) => profile.key === formState?.transportProfileKey);
  const selectedManualRoute = catalog?.routes.find((route) => route.id === formState?.manualRouteId) ?? null;

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          <>
            <button className="action-button action-button--secondary" onClick={() => void loadVehicleScreen()} type="button">
              Refresh registry
            </button>
            {canManageVehicles ? (
              <button className="action-button action-button--primary" onClick={handleStartCreate} type="button">
                Register vehicle
              </button>
            ) : null}
          </>
        }
        description="Register buses, bind them to hardware and LED behavior, and override route selection when field operations need direct control."
        eyebrow="Fleet Registry"
        title="Vehicles"
      />

      {!canManageVehicles ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can inspect vehicle assignments, but fleet changes require the fleet:manage permission.`}
          title="Vehicle changes restricted"
          tone="warn"
        />
      ) : null}

      {feedback ? <Notice body={feedback.body} title={feedback.title} tone={feedback.tone} /> : null}
      {error ? <Notice body={error} title="Vehicle operations unavailable" tone="critical" /> : null}

      <section className="metric-grid">
        <MetricCard detail="Total vehicles currently tracked in the admin registry." label="Managed vehicles" tone="accent" value={String(vehicles.length).padStart(2, "0")} />
        <MetricCard detail="Vehicles marked active in the operational status model." label="Active status" tone="good" value={String(activeCount).padStart(2, "0")} />
        <MetricCard detail="Vehicles currently enabled to participate in live operations." label="Enabled units" tone="good" value={String(enabledCount).padStart(2, "0")} />
        <MetricCard detail="Vehicles holding both device and display profile assignments." label="Fully profiled" tone={vehicles.length > 0 && fullyProfiledCount === vehicles.length ? "good" : "warn"} value={`${fullyProfiledCount}/${vehicles.length}`} />
      </section>

      <div className="split-layout">
        <div className="stack-card">
          <Panel description="Use this editor to define the bus identity, operational posture, hardware profile assignments, and optional manual route override." title={editorMode === "create" ? "Register vehicle" : `Editing ${formState?.vehicleCode ?? "vehicle"}`}>
            {catalog && formState ? (
              <form className="form-grid" onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}>
                <label className="field">
                  <span className="field__label">Vehicle code</span>
                  <input className="input-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("vehicleCode", event.currentTarget.value)} type="text" value={formState.vehicleCode} />
                </label>
                <label className="field">
                  <span className="field__label">Label</span>
                  <input className="input-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("label", event.currentTarget.value)} type="text" value={formState.label} />
                </label>
                <label className="field">
                  <span className="field__label">Registration plate</span>
                  <input className="input-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("registrationPlate", emptyToNull(event.currentTarget.value))} type="text" value={formState.registrationPlate ?? ""} />
                </label>
                <label className="field">
                  <span className="field__label">External vehicle ID</span>
                  <input className="input-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("externalVehicleId", emptyToNull(event.currentTarget.value))} type="text" value={formState.externalVehicleId ?? ""} />
                </label>
                <label className="field">
                  <span className="field__label">Transport profile</span>
                  <select className="select-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("transportProfileKey", event.currentTarget.value)} value={formState.transportProfileKey}>
                    {catalog.transportProfiles.map((profile) => <option key={profile.key} value={profile.key}>{profile.label}</option>)}
                  </select>
                  <span className="helper-text">{selectedTransportProfile ? `${selectedTransportProfile.mode} in ${selectedTransportProfile.serviceArea} using ${selectedTransportProfile.routeStrategyType}.` : "Choose the operational transport profile for this vehicle."}</span>
                </label>
                <label className="field">
                  <span className="field__label">Operational status</span>
                  <select className="select-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("operationalStatus", event.currentTarget.value as VehicleMutationInput["operationalStatus"])} value={formState.operationalStatus}>
                    {catalog.operationalStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Device profile</span>
                  <select className="select-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("deviceProfileId", emptyToNull(event.currentTarget.value))} value={formState.deviceProfileId ?? ""}>
                    <option value="">Unassigned</option>
                    {catalog.deviceProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Display profile</span>
                  <select className="select-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("displayProfileId", emptyToNull(event.currentTarget.value))} value={formState.displayProfileId ?? ""}>
                    <option value="">Unassigned</option>
                    {catalog.displayProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                  </select>
                </label>
                <label className="field field--wide">
                  <span className="field__label">Hardware model</span>
                  <input className="input-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("hardwareModel", emptyToNull(event.currentTarget.value))} type="text" value={formState.hardwareModel ?? ""} />
                </label>
                <label className="field">
                  <span className="field__label">Passenger capacity</span>
                  <input className="input-control" disabled={!canManageVehicles || isSaving || isDeleting} min={0} onChange={(event) => updateForm("passengerCapacity", readOptionalNumber(event.currentTarget.value))} step={1} type="number" value={formState.passengerCapacity ?? ""} />
                </label>
                <label className="field">
                  <span className="field__label">Wheelchair spaces</span>
                  <input className="input-control" disabled={!canManageVehicles || isSaving || isDeleting} min={0} onChange={(event) => updateForm("wheelchairSpaces", readRequiredNumber(event.currentTarget.value, 0))} step={1} type="number" value={formState.wheelchairSpaces} />
                </label>
                <label className="field">
                  <span className="field__label">Route override mode</span>
                  <select className="select-control" disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("routeOverrideMode", event.currentTarget.value as VehicleMutationInput["routeOverrideMode"])} value={formState.routeOverrideMode}>
                    {catalog.routeOverrideModes.map((mode) => <option key={mode} value={mode}>{formatLabel(mode)}</option>)}
                  </select>
                  <span className="helper-text">{formState.routeOverrideMode === "manual" ? selectedManualRoute ? `Manual route pinned to ${formatRouteLabel(selectedManualRoute)}.` : "Select the route to override automatic assignment." : "Use automatic route resolution from transport and telemetry inputs."}</span>
                </label>
                <label className="field field--wide">
                  <span className="field__label">Manual route</span>
                  <select className="select-control" disabled={!canManageVehicles || isSaving || isDeleting || formState.routeOverrideMode !== "manual" || catalog.routes.length === 0} onChange={(event) => updateForm("manualRouteId", emptyToNull(event.currentTarget.value))} value={formState.manualRouteId ?? ""}>
                    <option value="">Select route</option>
                    {catalog.routes.map((route) => <option key={route.id} value={route.id}>{formatRouteLabel(route)}</option>)}
                  </select>
                </label>
                <div className="checkbox-row field--wide">
                  <label className="checkbox-pill">
                    <input checked={formState.isEnabled} disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("isEnabled", event.currentTarget.checked)} type="checkbox" />
                    <span>Vehicle enabled for live use</span>
                  </label>
                  <label className="checkbox-pill">
                    <input checked={formState.bikeRack} disabled={!canManageVehicles || isSaving || isDeleting} onChange={(event) => updateForm("bikeRack", event.currentTarget.checked)} type="checkbox" />
                    <span>Bike rack equipped</span>
                  </label>
                </div>
                <div className="inline-form-actions field--wide">
                  {canManageVehicles ? <button className="action-button action-button--primary" disabled={isSaving || isDeleting} type="submit">{isSaving ? "Saving..." : editorMode === "create" ? "Create vehicle" : "Save changes"}</button> : null}
                  {canManageVehicles ? <button className="action-button action-button--secondary" onClick={handleStartCreate} type="button">Clear form</button> : null}
                  {editorMode === "edit" && canManageVehicles ? <button className="action-button action-button--ghost" disabled={isSaving || isDeleting} onClick={() => void handleDelete()} type="button">{isDeleting ? "Deleting..." : "Delete vehicle"}</button> : null}
                </div>
              </form>
            ) : (
              <div className="empty-state">Loading profile catalog and vehicle editor...</div>
            )}
          </Panel>

          <Panel description="Profile coverage and route control posture for the selected editor state." title="Assignment posture">
            <div className="detail-list">
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Transport profile</div>
                  <div className="detail-row__meta">Configuration-driven route and deployment behavior</div>
                </div>
                <span className="tone-pill tone-pill--accent">{selectedTransportProfile?.label ?? "Unassigned"}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Device catalog</div>
                  <div className="detail-row__meta">Profiles synced from config/cms/device-profiles</div>
                </div>
                <span className="tone-pill tone-pill--good">{String(catalog?.deviceProfiles.length ?? 0).padStart(2, "0")}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Display catalog</div>
                  <div className="detail-row__meta">LED display controller mappings available for assignment</div>
                </div>
                <span className="tone-pill tone-pill--good">{String(catalog?.displayProfiles.length ?? 0).padStart(2, "0")}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Manual overrides</div>
                  <div className="detail-row__meta">Vehicles currently pinned to a route outside automatic resolution</div>
                </div>
                <span className={`tone-pill tone-pill--${manualOverrideCount > 0 ? "warn" : "neutral"}`}>{manualOverrideCount}</span>
              </div>
            </div>
          </Panel>
        </div>

        <Panel description="Each vehicle card shows assignment coverage, operating posture, and direct actions for enablement or edit." title="Vehicle registry">
          {isLoading ? (
            <div className="empty-state">Loading vehicles and assignment catalog...</div>
          ) : vehicles.length === 0 ? (
            <div className="empty-state">No vehicles are registered yet. Use the form to create the first bus record.</div>
          ) : (
            <>
              <div className="toolbar-row">
                <div className="helper-text">{vehicles.length} vehicles loaded. Select a card to edit assignment details.</div>
                <div className="badge-row">
                  <span className="tone-pill tone-pill--good">{enabledCount} enabled</span>
                  <span className="tone-pill tone-pill--accent">{activeCount} active</span>
                  <span className={`tone-pill tone-pill--${manualOverrideCount > 0 ? "warn" : "neutral"}`}>{manualOverrideCount} manual override</span>
                </div>
              </div>

              <div className="registry-grid">
                {vehicles.map((vehicle) => {
                  const transportProfile = catalog?.transportProfiles.find((profile) => profile.key === vehicle.transportProfileKey);
                  const selected = vehicle.id === selectedVehicleId;

                  return (
                    <article className={`registry-card${selected ? " registry-card--selected" : ""}`} key={vehicle.id}>
                      <div className="registry-card__header">
                        <div>
                          <div className="registry-card__eyebrow">{vehicle.vehicleCode}</div>
                          <h3 className="registry-card__title">{vehicle.label}</h3>
                          <div className="registry-card__subtext">{vehicle.registrationPlate ?? "No plate"} · {transportProfile?.label ?? vehicle.transportProfileKey}</div>
                        </div>
                        <div className="badge-row">
                          <span className={`tone-pill tone-pill--${vehicle.isEnabled ? "good" : "critical"}`}>{vehicle.isEnabled ? "Enabled" : "Disabled"}</span>
                          <span className={`tone-pill tone-pill--${statusTone(vehicle.operationalStatus)}`}>{formatLabel(vehicle.operationalStatus)}</span>
                          <span className={`tone-pill tone-pill--${vehicle.routeOverrideMode === "manual" ? "warn" : "neutral"}`}>{vehicle.routeOverrideMode === "manual" ? "Manual route" : "Auto route"}</span>
                        </div>
                      </div>
                      <div className="registry-card__specs">
                        <div className="registry-card__spec"><span>Device</span><strong>{vehicle.deviceProfile?.label ?? "Unassigned"}</strong></div>
                        <div className="registry-card__spec"><span>Display</span><strong>{vehicle.displayProfile?.label ?? "Unassigned"}</strong></div>
                        <div className="registry-card__spec"><span>Manual route</span><strong>{vehicle.manualRoute ? formatRouteLabel(vehicle.manualRoute) : "Automatic"}</strong></div>
                        <div className="registry-card__spec"><span>Updated</span><strong>{formatRegistryTime(vehicle.updatedAt, locale)}</strong></div>
                      </div>

                      <div className="registry-card__actions">
                        <button className="action-button action-button--secondary" onClick={() => handleSelectVehicle(vehicle)} type="button">{selected ? "Editing" : "Edit vehicle"}</button>
                        {canManageVehicles ? <button className="action-button action-button--ghost" disabled={isSaving || isDeleting} onClick={() => void handleToggleEnabled(vehicle)} type="button">{vehicle.isEnabled ? "Disable" : "Enable"}</button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function createEmptyVehicleForm(catalog: VehicleCatalogResponse): VehicleMutationInput {
  return {
    bikeRack: false,
    deviceProfileId: null,
    displayProfileId: null,
    externalVehicleId: null,
    hardwareModel: null,
    isEnabled: true,
    label: "",
    manualRouteId: null,
    operationalStatus: catalog.operationalStatuses[0] ?? "active",
    passengerCapacity: null,
    registrationPlate: null,
    routeOverrideMode: catalog.routeOverrideModes[0] ?? "auto",
    transportProfileKey: catalog.transportProfiles[0]?.key ?? "",
    vehicleCode: "",
    wheelchairSpaces: 0
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function formatLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatRegistryTime(timestamp: string, locale?: string): string {
  return new Date(timestamp).toLocaleString(locale ?? undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function formatRouteLabel(route: RouteOption): string {
  return route.routeLongName ? `${route.routeShortName} · ${route.routeLongName}` : route.routeShortName;
}

function readOptionalNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRequiredNumber(value: string, fallback: number): number {
  if (value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortVehicleRecords(records: VehicleRecord[]): VehicleRecord[] {
  return [...records].sort((left, right) => left.vehicleCode.localeCompare(right.vehicleCode));
}

function statusTone(status: VehicleRecord["operationalStatus"]): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (status) {
    case "active":
      return "good";
    case "maintenance":
      return "warn";
    case "inactive":
      return "neutral";
    case "retired":
      return "critical";
    default:
      return "neutral";
  }
}

function toVehicleMutationInput(vehicle: VehicleRecord): VehicleMutationInput {
  return {
    bikeRack: vehicle.bikeRack,
    deviceProfileId: vehicle.deviceProfile?.id ?? null,
    displayProfileId: vehicle.displayProfile?.id ?? null,
    externalVehicleId: vehicle.externalVehicleId,
    hardwareModel: vehicle.hardwareModel,
    isEnabled: vehicle.isEnabled,
    label: vehicle.label,
    manualRouteId: vehicle.manualRoute?.id ?? null,
    operationalStatus: vehicle.operationalStatus,
    passengerCapacity: vehicle.passengerCapacity,
    registrationPlate: vehicle.registrationPlate,
    routeOverrideMode: vehicle.routeOverrideMode,
    transportProfileKey: vehicle.transportProfileKey,
    vehicleCode: vehicle.vehicleCode,
    wheelchairSpaces: vehicle.wheelchairSpaces
  };
}

function validateVehicleForm(input: VehicleMutationInput): string | null {
  if (input.vehicleCode.trim() === "") {
    return "Vehicle code is required.";
  }

  if (input.label.trim() === "") {
    return "Vehicle label is required.";
  }

  if (input.transportProfileKey.trim() === "") {
    return "Transport profile selection is required.";
  }

  if (input.wheelchairSpaces < 0) {
    return "Wheelchair spaces cannot be negative.";
  }

  if (input.passengerCapacity !== null && input.passengerCapacity < 0) {
    return "Passenger capacity cannot be negative.";
  }

  if (input.routeOverrideMode === "manual" && !input.manualRouteId) {
    return "Choose a manual route when manual override mode is enabled.";
  }

  return null;
}


