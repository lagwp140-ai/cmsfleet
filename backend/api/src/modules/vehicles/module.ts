import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";
import type { FastifyInstance, FastifyReply } from "fastify";

import { readTransportProfileCatalog, syncProfileCatalogs } from "./profile-catalog.js";
import { VehicleRepository } from "./repository.js";
import {
  VEHICLE_OPERATIONAL_STATUSES,
  VEHICLE_ROUTE_OVERRIDE_MODES,
  type VehicleManagementCatalog,
  type VehicleMutationInput,
  type VehicleRecord
} from "./types.js";

export async function registerVehiclesModule(
  app: FastifyInstance,
  _config: CmsConfig,
  context: ConfigRuntimeContext
): Promise<void> {
  await syncProfileCatalogs(app.db, context.configDirectory);

  const transportProfiles = readTransportProfileCatalog(context.configDirectory);

  if (transportProfiles.length === 0) {
    throw new Error("No transport profiles were found under config/cms/transport-profiles.");
  }

  const transportProfileKeys = new Set(transportProfiles.map((profile) => profile.key));
  const repository = new VehicleRepository(app.db);

  app.get("/api/admin/vehicles", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:read");

    if (!authUser) {
      return;
    }

    return {
      vehicles: await repository.listVehicles()
    };
  });

  app.get("/api/admin/vehicles/options", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:read");

    if (!authUser) {
      return;
    }

    const [deviceProfiles, displayProfiles, routes] = await Promise.all([
      repository.listDeviceProfiles(),
      repository.listDisplayProfiles(),
      repository.listRoutes()
    ]);

    const payload: VehicleManagementCatalog = {
      deviceProfiles,
      displayProfiles,
      operationalStatuses: [...VEHICLE_OPERATIONAL_STATUSES],
      routeOverrideModes: [...VEHICLE_ROUTE_OVERRIDE_MODES],
      routes,
      transportProfiles
    };

    return payload;
  });

  app.get("/api/admin/vehicles/:vehicleId", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:read");

    if (!authUser) {
      return;
    }

    const vehicleId = tryReadVehicleId(request.params, reply);

    if (!vehicleId) {
      return;
    }

    const vehicle = await repository.getVehicleById(vehicleId);

    if (!vehicle) {
      return reply.code(404).send({ message: "Vehicle not found." });
    }

    return {
      vehicle
    };
  });

  app.post("/api/admin/vehicles", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:manage");

    if (!authUser) {
      return;
    }

    let input: VehicleMutationInput;

    try {
      input = readVehicleMutationInput(request.body, transportProfileKeys);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid vehicle payload." });
    }

    const referenceError = await validateReferences(repository, input);

    if (referenceError) {
      return reply.code(400).send({ message: referenceError });
    }

    try {
      const vehicle = await repository.createVehicle(input);
      return reply.code(201).send({ vehicle });
    } catch (error) {
      return sendDatabaseError(reply, error);
    }
  });

  app.patch("/api/admin/vehicles/:vehicleId", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:manage");

    if (!authUser) {
      return;
    }

    const vehicleId = tryReadVehicleId(request.params, reply);

    if (!vehicleId) {
      return;
    }

    const currentVehicle = await repository.getVehicleById(vehicleId);

    if (!currentVehicle) {
      return reply.code(404).send({ message: "Vehicle not found." });
    }

    if (!isPlainObject(request.body)) {
      return reply.code(400).send({ message: "Vehicle payload must be a JSON object." });
    }

    let input: VehicleMutationInput;

    try {
      input = readVehicleMutationInput(
        {
          ...toVehicleMutationInput(currentVehicle),
          ...request.body
        },
        transportProfileKeys
      );
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid vehicle payload." });
    }

    const referenceError = await validateReferences(repository, input);

    if (referenceError) {
      return reply.code(400).send({ message: referenceError });
    }

    try {
      const vehicle = await repository.updateVehicle(vehicleId, input);

      if (!vehicle) {
        return reply.code(404).send({ message: "Vehicle not found." });
      }

      return {
        vehicle
      };
    } catch (error) {
      return sendDatabaseError(reply, error);
    }
  });

  app.delete("/api/admin/vehicles/:vehicleId", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:manage");

    if (!authUser) {
      return;
    }

    const vehicleId = tryReadVehicleId(request.params, reply);

    if (!vehicleId) {
      return;
    }

    try {
      const deleted = await repository.deleteVehicle(vehicleId);

      if (!deleted) {
        return reply.code(404).send({ message: "Vehicle not found." });
      }

      return reply.code(204).send();
    } catch (error) {
      return sendDatabaseError(reply, error);
    }
  });
}

async function validateReferences(
  repository: VehicleRepository,
  input: VehicleMutationInput
): Promise<string | null> {
  const [deviceProfileExists, displayProfileExists, routeExists] = await Promise.all([
    input.deviceProfileId ? repository.deviceProfileExists(input.deviceProfileId) : Promise.resolve(true),
    input.displayProfileId ? repository.displayProfileExists(input.displayProfileId) : Promise.resolve(true),
    input.routeOverrideMode === "manual" && input.manualRouteId
      ? repository.routeExists(input.manualRouteId)
      : Promise.resolve(true)
  ]);

  if (!deviceProfileExists) {
    return "Selected device profile does not exist.";
  }

  if (!displayProfileExists) {
    return "Selected display profile does not exist.";
  }

  if (!routeExists) {
    return "Selected manual route does not exist.";
  }

  return null;
}

function readVehicleId(params: unknown): string {
  if (!isPlainObject(params) || typeof params.vehicleId !== "string" || params.vehicleId.trim() === "") {
    throw new Error("Vehicle id is required.");
  }

  return params.vehicleId.trim();
}

function readVehicleMutationInput(body: unknown, transportProfileKeys: Set<string>): VehicleMutationInput {
  if (!isPlainObject(body)) {
    throw new Error("Vehicle payload must be a JSON object.");
  }

  const vehicleCode = readRequiredString(body.vehicleCode, "vehicleCode");
  const label = readRequiredString(body.label, "label");
  const transportProfileKey = readRequiredString(body.transportProfileKey, "transportProfileKey");

  if (!transportProfileKeys.has(transportProfileKey)) {
    throw new Error(`Unknown transport profile: ${transportProfileKey}.`);
  }

  const operationalStatus = readEnumValue(
    body.operationalStatus,
    VEHICLE_OPERATIONAL_STATUSES,
    "operationalStatus"
  );
  const routeOverrideMode = readEnumValue(
    body.routeOverrideMode,
    VEHICLE_ROUTE_OVERRIDE_MODES,
    "routeOverrideMode"
  );
  const manualRouteId =
    routeOverrideMode === "manual" ? readOptionalString(body.manualRouteId, "manualRouteId") : null;

  if (routeOverrideMode === "manual" && manualRouteId === null) {
    throw new Error("manualRouteId is required when routeOverrideMode is manual.");
  }

  return {
    bikeRack: readBoolean(body.bikeRack, "bikeRack"),
    deviceProfileId: readOptionalString(body.deviceProfileId, "deviceProfileId"),
    displayProfileId: readOptionalString(body.displayProfileId, "displayProfileId"),
    externalVehicleId: readOptionalString(body.externalVehicleId, "externalVehicleId"),
    hardwareModel: readOptionalString(body.hardwareModel, "hardwareModel"),
    isEnabled: readBoolean(body.isEnabled, "isEnabled"),
    label,
    manualRouteId,
    operationalStatus,
    passengerCapacity: readOptionalInteger(body.passengerCapacity, "passengerCapacity", { minimum: 0 }),
    registrationPlate: readOptionalString(body.registrationPlate, "registrationPlate"),
    routeOverrideMode,
    transportProfileKey,
    vehicleCode,
    wheelchairSpaces: readInteger(body.wheelchairSpaces, "wheelchairSpaces", { minimum: 0 })
  };
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

function readEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fieldName: string
): T[number] {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value as T[number];
}

function readInteger(
  value: unknown,
  fieldName: string,
  options: { minimum?: number } = {}
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer.`);
  }

  if (options.minimum !== undefined && value < options.minimum) {
    throw new Error(`${fieldName} must be at least ${options.minimum}.`);
  }

  return value;
}

function readOptionalInteger(
  value: unknown,
  fieldName: string,
  options: { minimum?: number } = {}
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readInteger(value, fieldName, options);
}

function readOptionalString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null.`);
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = readOptionalString(value, fieldName);

  if (normalized === null) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function sendDatabaseError(reply: FastifyReply, error: unknown) {
  if (isDatabaseError(error)) {
    if (error.code === "23505") {
      return reply.code(409).send({ message: "Vehicle data conflicts with an existing record." });
    }

    if (error.code === "23503") {
      return reply.code(400).send({ message: "Vehicle payload references a related record that does not exist." });
    }

    if (error.code === "23514") {
      return reply.code(400).send({ message: "Vehicle payload violates a database constraint." });
    }
  }

  throw error;
}

function isDatabaseError(error: unknown): error is { code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function tryReadVehicleId(params: unknown, reply: FastifyReply): string | undefined {
  try {
    return readVehicleId(params);
  } catch (error) {
    reply.code(400).send({ message: error instanceof Error ? error.message : "Vehicle id is required." });
    return undefined;
  }
}
