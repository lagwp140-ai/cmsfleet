import type { Pool } from "pg";

import type {
  DeviceProfileCatalogItem,
  DisplayProfileCatalogItem,
  RouteCatalogItem,
  VehicleMutationInput,
  VehicleRecord
} from "./types.js";

interface VehicleRow {
  bike_rack: boolean;
  created_at: Date | string;
  device_profile_id: string | null;
  device_profile_key: string | null;
  device_profile_label: string | null;
  device_profile_operating_system: string | null;
  device_profile_platform: string | null;
  display_profile_controller: string | null;
  display_profile_id: string | null;
  display_profile_key: string | null;
  display_profile_label: string | null;
  display_profile_provider: string | null;
  external_vehicle_id: string | null;
  hardware_model: string | null;
  id: string;
  is_enabled: boolean;
  label: string;
  manual_route_id: string | null;
  manual_route_long_name: string | null;
  manual_route_short_name: string | null;
  manual_route_updated_at: Date | string | null;
  passenger_capacity: number | null;
  registration_plate: string | null;
  route_override_mode: VehicleRecord["routeOverrideMode"];
  status: VehicleRecord["operationalStatus"];
  transport_profile_key: string;
  updated_at: Date | string;
  vehicle_code: string;
  wheelchair_spaces: number;
}

const VEHICLE_SELECT_SQL = `
  SELECT
    v.id,
    v.vehicle_code,
    v.external_vehicle_id,
    v.registration_plate,
    v.label,
    v.status,
    v.device_profile_id,
    v.display_profile_id,
    v.hardware_model,
    v.passenger_capacity,
    v.wheelchair_spaces,
    v.bike_rack,
    v.is_enabled,
    v.transport_profile_key,
    v.route_override_mode,
    v.manual_route_id,
    v.manual_route_updated_at,
    v.created_at,
    v.updated_at,
    dp.profile_key AS device_profile_key,
    dp.label AS device_profile_label,
    dp.platform AS device_profile_platform,
    dp.operating_system AS device_profile_operating_system,
    dsp.profile_key AS display_profile_key,
    dsp.label AS display_profile_label,
    dsp.provider AS display_profile_provider,
    dsp.controller AS display_profile_controller,
    route.route_short_name AS manual_route_short_name,
    route.route_long_name AS manual_route_long_name
  FROM fleet.vehicles v
  LEFT JOIN fleet.device_profiles dp ON dp.id = v.device_profile_id
  LEFT JOIN fleet.display_profiles dsp ON dsp.id = v.display_profile_id
  LEFT JOIN transit.routes route ON route.id = v.manual_route_id
`;

export class VehicleRepository {
  constructor(private readonly pool: Pool) {}

  async createVehicle(input: VehicleMutationInput): Promise<VehicleRecord> {
    const result = await this.pool.query<{ id: string }>(
      `
        INSERT INTO fleet.vehicles (
          vehicle_code,
          external_vehicle_id,
          registration_plate,
          label,
          status,
          device_profile_id,
          display_profile_id,
          hardware_model,
          passenger_capacity,
          wheelchair_spaces,
          bike_rack,
          is_enabled,
          transport_profile_key,
          route_override_mode,
          manual_route_id,
          manual_route_updated_at,
          manual_route_updated_by_user_id,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          CASE WHEN $14 = 'manual' AND $15 IS NOT NULL THEN NOW() ELSE NULL END,
          NULL,
          NOW()
        )
        RETURNING id
      `,
      [
        input.vehicleCode,
        input.externalVehicleId,
        input.registrationPlate,
        input.label,
        input.operationalStatus,
        input.deviceProfileId,
        input.displayProfileId,
        input.hardwareModel,
        input.passengerCapacity,
        input.wheelchairSpaces,
        input.bikeRack,
        input.isEnabled,
        input.transportProfileKey,
        input.routeOverrideMode,
        input.manualRouteId
      ]
    );

    return (await this.getVehicleById(result.rows[0]!.id)) as VehicleRecord;
  }

  async deleteVehicle(vehicleId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        DELETE FROM fleet.vehicles
        WHERE id = $1
      `,
      [vehicleId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deviceProfileExists(profileId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        SELECT 1
        FROM fleet.device_profiles
        WHERE id = $1
      `,
      [profileId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async displayProfileExists(profileId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        SELECT 1
        FROM fleet.display_profiles
        WHERE id = $1
      `,
      [profileId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async getVehicleById(vehicleId: string): Promise<VehicleRecord | null> {
    const result = await this.pool.query<VehicleRow>(
      `${VEHICLE_SELECT_SQL}
       WHERE v.id = $1`,
      [vehicleId]
    );

    return result.rows[0] ? mapVehicleRow(result.rows[0]) : null;
  }

  async listDeviceProfiles(): Promise<DeviceProfileCatalogItem[]> {
    const result = await this.pool.query<DeviceProfileCatalogItem>(
      `
        SELECT
          id,
          label,
          operating_system AS "operatingSystem",
          platform,
          profile_key AS "profileKey"
        FROM fleet.device_profiles
        ORDER BY label ASC, profile_key ASC
      `
    );

    return result.rows;
  }

  async listDisplayProfiles(): Promise<DisplayProfileCatalogItem[]> {
    const result = await this.pool.query<DisplayProfileCatalogItem>(
      `
        SELECT
          controller,
          id,
          label,
          profile_key AS "profileKey",
          provider
        FROM fleet.display_profiles
        ORDER BY label ASC, profile_key ASC
      `
    );

    return result.rows;
  }

  async listRoutes(): Promise<RouteCatalogItem[]> {
    const result = await this.pool.query<RouteCatalogItem>(
      `
        SELECT
          id,
          route_long_name AS "routeLongName",
          route_short_name AS "routeShortName"
        FROM transit.routes
        WHERE is_active = TRUE
        ORDER BY route_short_name ASC, route_long_name ASC NULLS LAST
      `
    );

    return result.rows;
  }

  async listVehicles(): Promise<VehicleRecord[]> {
    const result = await this.pool.query<VehicleRow>(
      `${VEHICLE_SELECT_SQL}
       ORDER BY v.vehicle_code ASC, v.label ASC`
    );

    return result.rows.map(mapVehicleRow);
  }

  async routeExists(routeId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        SELECT 1
        FROM transit.routes
        WHERE id = $1
      `,
      [routeId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async updateVehicle(vehicleId: string, input: VehicleMutationInput): Promise<VehicleRecord | null> {
    const result = await this.pool.query<{ id: string }>(
      `
        UPDATE fleet.vehicles
        SET vehicle_code = $2,
            external_vehicle_id = $3,
            registration_plate = $4,
            label = $5,
            status = $6,
            device_profile_id = $7,
            display_profile_id = $8,
            hardware_model = $9,
            passenger_capacity = $10,
            wheelchair_spaces = $11,
            bike_rack = $12,
            is_enabled = $13,
            transport_profile_key = $14,
            route_override_mode = $15,
            manual_route_id = $16,
            manual_route_updated_at = CASE
              WHEN route_override_mode IS DISTINCT FROM $15 OR manual_route_id IS DISTINCT FROM $16
                THEN CASE WHEN $15 = 'manual' AND $16 IS NOT NULL THEN NOW() ELSE NULL END
              ELSE manual_route_updated_at
            END,
            manual_route_updated_by_user_id = CASE
              WHEN route_override_mode IS DISTINCT FROM $15 OR manual_route_id IS DISTINCT FROM $16 THEN NULL
              ELSE manual_route_updated_by_user_id
            END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [
        vehicleId,
        input.vehicleCode,
        input.externalVehicleId,
        input.registrationPlate,
        input.label,
        input.operationalStatus,
        input.deviceProfileId,
        input.displayProfileId,
        input.hardwareModel,
        input.passengerCapacity,
        input.wheelchairSpaces,
        input.bikeRack,
        input.isEnabled,
        input.transportProfileKey,
        input.routeOverrideMode,
        input.manualRouteId
      ]
    );

    return result.rows[0] ? this.getVehicleById(result.rows[0].id) : null;
  }
}

function mapVehicleRow(row: VehicleRow): VehicleRecord {
  return {
    bikeRack: row.bike_rack,
    createdAt: serializeTimestamp(row.created_at) ?? new Date().toISOString(),
    deviceProfile:
      row.device_profile_id === null
        ? null
        : {
            id: row.device_profile_id,
            label: row.device_profile_label ?? row.device_profile_key ?? "Unknown device profile",
            operatingSystem: row.device_profile_operating_system ?? "unknown",
            platform: row.device_profile_platform ?? "unknown",
            profileKey: row.device_profile_key ?? row.device_profile_id
          },
    displayProfile:
      row.display_profile_id === null
        ? null
        : {
            controller: row.display_profile_controller ?? "unknown",
            id: row.display_profile_id,
            label: row.display_profile_label ?? row.display_profile_key ?? "Unknown display profile",
            profileKey: row.display_profile_key ?? row.display_profile_id,
            provider: row.display_profile_provider ?? "unknown"
          },
    externalVehicleId: row.external_vehicle_id,
    hardwareModel: row.hardware_model,
    id: row.id,
    isEnabled: row.is_enabled,
    label: row.label,
    manualRoute:
      row.manual_route_id === null
        ? null
        : {
            id: row.manual_route_id,
            routeLongName: row.manual_route_long_name,
            routeShortName: row.manual_route_short_name ?? ""
          },
    manualRouteUpdatedAt: serializeTimestamp(row.manual_route_updated_at),
    operationalStatus: row.status,
    passengerCapacity: row.passenger_capacity,
    registrationPlate: row.registration_plate,
    routeOverrideMode: row.route_override_mode,
    transportProfileKey: row.transport_profile_key,
    updatedAt: serializeTimestamp(row.updated_at) ?? new Date().toISOString(),
    vehicleCode: row.vehicle_code,
    wheelchairSpaces: row.wheelchair_spaces
  };
}

function serializeTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

