export const VEHICLE_OPERATIONAL_STATUSES = ["active", "inactive", "maintenance", "retired"] as const;
export const VEHICLE_ROUTE_OVERRIDE_MODES = ["auto", "manual"] as const;

export type VehicleOperationalStatus = (typeof VEHICLE_OPERATIONAL_STATUSES)[number];
export type VehicleRouteOverrideMode = (typeof VEHICLE_ROUTE_OVERRIDE_MODES)[number];

export interface DeviceProfileCatalogItem {
  id: string;
  label: string;
  operatingSystem: string;
  platform: string;
  profileKey: string;
}

export interface DisplayProfileCatalogItem {
  controller: string;
  id: string;
  label: string;
  profileKey: string;
  provider: string;
}

export interface TransportProfileCatalogItem {
  key: string;
  label: string;
  mode: string;
  routeStrategyType: string;
  serviceArea: string;
}

export interface RouteCatalogItem {
  id: string;
  routeLongName: string | null;
  routeShortName: string;
}

export interface VehicleManagementCatalog {
  deviceProfiles: DeviceProfileCatalogItem[];
  displayProfiles: DisplayProfileCatalogItem[];
  operationalStatuses: VehicleOperationalStatus[];
  routeOverrideModes: VehicleRouteOverrideMode[];
  routes: RouteCatalogItem[];
  transportProfiles: TransportProfileCatalogItem[];
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
  deviceProfile: DeviceProfileCatalogItem | null;
  displayProfile: DisplayProfileCatalogItem | null;
  externalVehicleId: string | null;
  hardwareModel: string | null;
  id: string;
  isEnabled: boolean;
  label: string;
  manualRoute: RouteCatalogItem | null;
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
