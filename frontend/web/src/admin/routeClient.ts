import type { RouteResolutionStatusResponse } from "./routeTypes";
import { requestJson } from "../lib/apiClient";

export async function fetchRouteResolutionStatus(referenceTime?: string): Promise<RouteResolutionStatusResponse> {
  const query = referenceTime ? `?at=${encodeURIComponent(referenceTime)}` : "";
  return requestJson<RouteResolutionStatusResponse>(`/api/admin/routes/status${query}`);
}
