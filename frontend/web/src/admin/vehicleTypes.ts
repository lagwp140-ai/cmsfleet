export type VehicleOperationalStatus = "active" | "inactive" | "maintenance" | "retired";
export type VehicleRouteOverrideMode = "auto" | "manual";

export interface DeviceProfileOption {
  id: string;
  label: string;
  operatingSystem: string;
  platform: string;
  profileKey: string;
}

export interface DisplayProfileOption {
  controller: string;
  id: string;
  label: string;
  profileKey: string;
  provider: string;
}

export interface TransportProfileOption {
  key: string;
  label: string;
  mode: string;
  routeStrategyType: string;
  serviceArea: string;
}

export interface RouteOption {
  id: string;
  routeLongName: string | null;
  routeShortName: string;
}

export interface VehicleCatalogResponse {
  deviceProfiles: DeviceProfileOption[];
  displayProfiles: DisplayProfileOption[];
  operationalStatuses: VehicleOperationalStatus[];
  routeOverrideModes: VehicleRouteOverrideMode[];
  routes: RouteOption[];
  transportProfiles: TransportProfileOption[];
}

export interface VehicleMutationInput {
  bikeRack: boolean;
  deviceProfileId: string | null;
  displayProfileId: string | null;
  externalVehicleId: string | null;
  hardwareModel: string | null;
  isEnabled: boolean;
  label: string;
  manualRouteId: string | null;
  operationalStatus: VehicleOperationalStatus;
  passengerCapacity: number | null;
  registrationPlate: string | null;
  routeOverrideMode: VehicleRouteOverrideMode;
  transportProfileKey: string;
  vehicleCode: string;
  wheelchairSpaces: number;
}

export interface VehicleRecord {
  bikeRack: boolean;
  createdAt: string;
  deviceProfile: DeviceProfileOption | null;
  displayProfile: DisplayProfileOption | null;
  externalVehicleId: string | null;
  hardwareModel: string | null;
  id: string;
  isEnabled: boolean;
  label: string;
  manualRoute: RouteOption | null;
  manualRouteUpdatedAt: string | null;
  operationalStatus: VehicleOperationalStatus;
  passengerCapacity: number | null;
  registrationPlate: string | null;
  routeOverrideMode: VehicleRouteOverrideMode;
  transportProfileKey: string;
  updatedAt: string;
  vehicleCode: string;
  wheelchairSpaces: number;
}
