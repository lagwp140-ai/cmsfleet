import { ApiError } from "../auth/authClient";

import type { VehicleCatalogResponse, VehicleMutationInput, VehicleRecord } from "./vehicleTypes";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = await readPayload(response);
    throw new ApiError(payload.message ?? `Request failed with status ${response.status}.`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readPayload(response: Response): Promise<{ message?: string }> {
  try {
    return (await response.json()) as { message?: string };
  } catch {
    return {};
  }
}

export async function createVehicle(input: VehicleMutationInput): Promise<VehicleRecord> {
  const response = await request<{ vehicle: VehicleRecord }>("/api/admin/vehicles", {
    body: JSON.stringify(input),
    method: "POST"
  });

  return response.vehicle;
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  await request<void>(`/api/admin/vehicles/${vehicleId}`, {
    method: "DELETE"
  });
}

export async function fetchVehicleCatalog(): Promise<VehicleCatalogResponse> {
  return request<VehicleCatalogResponse>("/api/admin/vehicles/options");
}

export async function fetchVehicles(): Promise<VehicleRecord[]> {
  const response = await request<{ vehicles: VehicleRecord[] }>("/api/admin/vehicles");
  return response.vehicles;
}

export async function updateVehicle(vehicleId: string, input: Partial<VehicleMutationInput>): Promise<VehicleRecord> {
  const response = await request<{ vehicle: VehicleRecord }>(`/api/admin/vehicles/${vehicleId}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });

  return response.vehicle;
}
