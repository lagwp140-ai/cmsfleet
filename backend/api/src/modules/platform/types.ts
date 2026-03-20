export type PlatformCapabilityStatus = "active" | "ready" | "planned";
export type PlatformRoadmapPhase = "now" | "next" | "later";

export interface PlatformCapability {
  category: string;
  contractSurfaces: string[];
  dependsOn: string[];
  id: string;
  ownedBy: string;
  status: PlatformCapabilityStatus;
  summary: string;
}

export interface PlatformRoadmapItem {
  deliveryRuntime: string;
  dependsOn: string[];
  id: string;
  phase: PlatformRoadmapPhase;
  status: PlatformCapabilityStatus;
  summary: string;
}

export interface PlatformExtensionsResponse {
  activeModules: string[];
  capabilities: PlatformCapability[];
  generatedAt: string;
  intent: string;
  mvpGuardrails: string[];
  roadmap: PlatformRoadmapItem[];
}
