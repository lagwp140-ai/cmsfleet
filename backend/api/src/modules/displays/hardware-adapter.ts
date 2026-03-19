import type { DisplayAdapterDeliveryInput, DisplayAdapterHealthReport, DisplayAdapterSendResult } from "./types.js";

export interface DisplayHardwareAdapter {
  readonly adapterId: string;
  readonly adapterMode: "mock" | "hardware";

  getHealth(): Promise<DisplayAdapterHealthReport>;
  send(input: DisplayAdapterDeliveryInput): Promise<DisplayAdapterSendResult>;
}
