import type { VehicleCatalogResponse, VehicleMutationInput, VehicleRecord } from "./vehicleTypes";
import { requestJson } from "../lib/apiClient";

export async function createVehicle(input: VehicleMutationInput): Promise<VehicleRecord> {
  const response = await requestJson<{ vehicle: VehicleRecord }>("/api/admin/vehicles", {
    body: JSON.stringify(input),
    method: "POST"
  });

  return response.vehicle;
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  await requestJson<void>(`/api/admin/vehicles/${vehicleId}`, {
    method: "DELETE"
  });
}

export async function fetchVehicleCatalog(): Promise<VehicleCatalogResponse> {
  return requestJson<VehicleCatalogResponse>("/api/admin/vehicles/options");
}

export async function fetchVehicles(): Promise<VehicleRecord[]> {
  const response = await requestJson<{ vehicles: VehicleRecord[] }>("/api/admin/vehicles");
  return response.vehicles;
}

export async function updateVehicle(vehicleId: string, input: Partial<VehicleMutationInput>): Promise<VehicleRecord> {
  const response = await requestJson<{ vehicle: VehicleRecord }>(`/api/admin/vehicles/${vehicleId}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });

  return response.vehicle;
}
