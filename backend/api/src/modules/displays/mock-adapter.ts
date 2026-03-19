import { randomUUID } from "node:crypto";

import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";

import type { DisplayHardwareAdapter } from "./hardware-adapter.js";
import type {
  DisplayAdapterDeliveryInput,
  DisplayAdapterHealthReport,
  DisplayAdapterHealthState,
  DisplayAdapterSendResult
} from "./types.js";

const FAILURE_TOKEN = "MOCK_FAIL";
const RECENT_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const RECENT_RESULT_LIMIT = 25;

interface MockAdapterActivity {
  acceptedAt: string;
  deliveryId: string;
  ok: boolean;
}

export class MockDisplayHardwareAdapter implements DisplayHardwareAdapter {
  readonly adapterId: string;
  readonly adapterMode = "mock" as const;

  private lastError: string | null = null;
  private lastHealthyAt: string | null = null;
  private lastSuccessfulDeliveryAt: string | null = null;
  private lastUnhealthyAt: string | null = null;
  private readonly recentActivity: MockAdapterActivity[] = [];

  constructor(
    private readonly config: CmsConfig,
    private readonly logger: FastifyBaseLogger
  ) {
    this.adapterId = `mock-${this.config.ledDisplay.profileId}`;
    this.lastHealthyAt = new Date().toISOString();
  }

  async getHealth(): Promise<DisplayAdapterHealthReport> {
    return {
      adapterId: this.adapterId,
      adapterMode: this.adapterMode,
      controller: this.config.ledDisplay.controller,
      lastError: this.lastError,
      lastHealthyAt: this.lastHealthyAt,
      lastSuccessfulDeliveryAt: this.lastSuccessfulDeliveryAt,
      lastUnhealthyAt: this.lastUnhealthyAt,
      message: this.buildHealthMessage(),
      provider: this.config.ledDisplay.provider,
      state: this.getHealthState(),
      supportedOperations: [...this.config.ledDisplay.controllerContract.supportedOperations],
      transport: this.config.ledDisplay.controllerContract.transport
    };
  }

  async send(input: DisplayAdapterDeliveryInput): Promise<DisplayAdapterSendResult> {
    const shouldFail = input.payload.panels.some((panel) =>
      panel.frames.some((frame) => frame.text.toUpperCase().includes(FAILURE_TOKEN))
    );

    if (shouldFail) {
      const errorMessage = `Mock display adapter rejected delivery ${input.deliveryId} because payload text included ${FAILURE_TOKEN}.`;
      this.lastError = errorMessage;
      this.lastUnhealthyAt = new Date().toISOString();
      this.recordActivity({
        acceptedAt: this.lastUnhealthyAt,
        deliveryId: input.deliveryId,
        ok: false
      });
      this.logger.warn({ deliveryId: input.deliveryId }, errorMessage);
      throw new Error(errorMessage);
    }

    const acceptedAt = new Date().toISOString();
    const adapterMessageId = `mock-msg-${randomUUID()}`;
    this.lastError = null;
    this.lastHealthyAt = acceptedAt;
    this.lastSuccessfulDeliveryAt = acceptedAt;
    this.recordActivity({
      acceptedAt,
      deliveryId: input.deliveryId,
      ok: true
    });

    this.logger.info(
      {
        adapterMessageId,
        attemptNumber: input.attemptNumber,
        deliveryId: input.deliveryId,
        panels: input.payload.panels.length,
        vehicleCode: input.payload.vehicle?.vehicleCode ?? null
      },
      "Mock display adapter accepted display delivery"
    );

    return {
      acceptedAt,
      adapterMessageId,
      metadata: {
        mode: this.adapterMode,
        recentActivitySize: this.recentActivity.length
      }
    };
  }

  private buildHealthMessage(): string {
    const lastActivity = this.recentActivity[0] ?? null;

    if (!lastActivity) {
      return "Mock display adapter is idle and ready to accept deliveries.";
    }

    if (!lastActivity.ok) {
      return "Mock display adapter recorded a recent delivery failure.";
    }

    return "Mock display adapter is accepting queued display deliveries.";
  }

  private getHealthState(): DisplayAdapterHealthState {
    const lastActivity = this.recentActivity[0] ?? null;

    if (!lastActivity) {
      return "healthy";
    }

    if (!lastActivity.ok) {
      const ageMs = Date.now() - Date.parse(lastActivity.acceptedAt);
      return ageMs <= RECENT_FAILURE_WINDOW_MS ? "degraded" : "healthy";
    }

    return "healthy";
  }

  private recordActivity(entry: MockAdapterActivity) {
    this.recentActivity.unshift(entry);

    if (this.recentActivity.length > RECENT_RESULT_LIMIT) {
      this.recentActivity.length = RECENT_RESULT_LIMIT;
    }
  }
}
