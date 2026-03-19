import { randomUUID } from "node:crypto";

import type { FastifyBaseLogger } from "fastify";

import type { DisplayHardwareAdapter } from "./hardware-adapter.js";
import type {
  DisplayCommandResponse,
  DisplayDeliveryListResponse,
  DisplayDeliveryRecord,
  DisplayQueueOverview
} from "./types.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_INTERVAL_MS = 2_000;
const DEFAULT_RETAINED_DELIVERIES = 100;

interface DisplayDeliveryServiceOptions {
  maxAttempts?: number;
  retainedDeliveries?: number;
  retryIntervalMs?: number;
}

export class DisplayDeliveryService {
  private activeDeliveryId: string | null = null;
  private processing = false;
  private readonly deliveryOrder: string[] = [];
  private readonly deliveries = new Map<string, DisplayDeliveryRecord>();
  private readonly maxAttempts: number;
  private readonly retainedDeliveries: number;
  private retryTimer: NodeJS.Timeout | null = null;
  private readonly retryIntervalMs: number;

  constructor(
    private readonly adapter: DisplayHardwareAdapter,
    private readonly logger: FastifyBaseLogger,
    options: DisplayDeliveryServiceOptions = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retainedDeliveries = options.retainedDeliveries ?? DEFAULT_RETAINED_DELIVERIES;
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  }

  async enqueue(command: DisplayCommandResponse, requestedByUserId: string | null): Promise<DisplayDeliveryRecord> {
    const now = new Date().toISOString();
    const deliveryId = randomUUID();
    const health = await this.adapter.getHealth();
    const record: DisplayDeliveryRecord = {
      adapterId: this.adapter.adapterId,
      adapterMessageId: null,
      adapterMode: this.adapter.adapterMode,
      attemptCount: 0,
      context: command.context,
      createdAt: now,
      deliveredAt: null,
      deliveryId,
      errorMessage: null,
      lastAttemptAt: null,
      nextAttemptAt: null,
      payload: command.payload,
      requestedByUserId,
      status: "queued"
    };

    this.deliveries.set(deliveryId, record);
    this.deliveryOrder.unshift(deliveryId);
    this.pruneRetainedDeliveries();

    this.logger.info(
      {
        adapterId: health.adapterId,
        deliveryId,
        queueDepth: this.countPendingDeliveries(),
        vehicleCode: command.payload.vehicle?.vehicleCode ?? null
      },
      "Queued display delivery for adapter processing"
    );

    this.scheduleImmediateDrain();

    return record;
  }

  async getQueueOverview(): Promise<DisplayQueueOverview> {
    const adapterHealth = await this.adapter.getHealth();
    const totals = this.getTotals();

    return {
      activeDeliveryId: this.activeDeliveryId,
      adapter: adapterHealth,
      maxAttempts: this.maxAttempts,
      processing: this.processing,
      queueDepth: this.countPendingDeliveries(),
      retainedDeliveries: this.deliveryOrder.length,
      retryDepth: this.countRetryingDeliveries(),
      retryIntervalMs: this.retryIntervalMs,
      totals
    };
  }

  async listDeliveries(
    limit = 25,
    filters: { search?: string; status?: DisplayDeliveryRecord["status"] } = {}
  ): Promise<DisplayDeliveryListResponse> {
    const normalizedSearch = filters.search?.toLowerCase();
    const deliveries = this.deliveryOrder
      .map((deliveryId) => this.deliveries.get(deliveryId))
      .filter((delivery): delivery is DisplayDeliveryRecord => delivery !== undefined)
      .filter((delivery) => {
        if (filters.status && delivery.status !== filters.status) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const haystack = [
          delivery.deliveryId,
          delivery.status,
          delivery.payload.vehicle?.vehicleCode,
          delivery.payload.vehicle?.label,
          delivery.payload.systemStatus,
          delivery.context.destination,
          delivery.context.routeShortName,
          delivery.errorMessage
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .slice(0, limit);

    return {
      deliveries,
      queue: await this.getQueueOverview()
    };
  }

  async close(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    try {
      while (true) {
        const nextDelivery = this.findNextReadyDelivery();

        if (!nextDelivery) {
          break;
        }

        await this.processDelivery(nextDelivery.deliveryId);
      }
    } finally {
      this.processing = false;
      this.activeDeliveryId = null;
      this.scheduleRetryDrainIfNeeded();
    }
  }

  private findNextReadyDelivery(): DisplayDeliveryRecord | null {
    const now = Date.now();

    for (const deliveryId of this.deliveryOrder) {
      const delivery = this.deliveries.get(deliveryId);

      if (!delivery) {
        continue;
      }

      if (delivery.status !== "queued" && delivery.status !== "retry_waiting") {
        continue;
      }

      if (delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > now) {
        continue;
      }

      return delivery;
    }

    return null;
  }

  private getTotals() {
    let delivered = 0;
    let failed = 0;
    let pending = 0;

    for (const delivery of this.deliveries.values()) {
      if (delivery.status === "delivered") {
        delivered += 1;
        continue;
      }

      if (delivery.status === "failed") {
        failed += 1;
        continue;
      }

      pending += 1;
    }

    return { delivered, failed, pending };
  }

  private countPendingDeliveries(): number {
    let count = 0;

    for (const delivery of this.deliveries.values()) {
      if (delivery.status === "queued" || delivery.status === "processing" || delivery.status === "retry_waiting") {
        count += 1;
      }
    }

    return count;
  }

  private countRetryingDeliveries(): number {
    let count = 0;

    for (const delivery of this.deliveries.values()) {
      if (delivery.status === "retry_waiting") {
        count += 1;
      }
    }

    return count;
  }

  private async processDelivery(deliveryId: string): Promise<void> {
    const existing = this.deliveries.get(deliveryId);

    if (!existing) {
      return;
    }

    const attemptNumber = existing.attemptCount + 1;
    const attemptAt = new Date().toISOString();
    const processingRecord: DisplayDeliveryRecord = {
      ...existing,
      attemptCount: attemptNumber,
      errorMessage: null,
      lastAttemptAt: attemptAt,
      nextAttemptAt: null,
      status: "processing"
    };
    this.deliveries.set(deliveryId, processingRecord);
    this.activeDeliveryId = deliveryId;

    try {
      const result = await this.adapter.send({
        attemptNumber,
        deliveryId,
        payload: processingRecord.payload,
        requestedAt: attemptAt,
        requestedByUserId: processingRecord.requestedByUserId
      });

      const deliveredRecord: DisplayDeliveryRecord = {
        ...processingRecord,
        adapterMessageId: result.adapterMessageId,
        deliveredAt: result.acceptedAt,
        errorMessage: null,
        nextAttemptAt: null,
        status: "delivered"
      };
      this.deliveries.set(deliveryId, deliveredRecord);
      this.logger.info({ adapterMessageId: result.adapterMessageId, deliveryId }, "Display delivery completed");
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Display adapter delivery failed.";

      if (attemptNumber >= this.maxAttempts) {
        const failedRecord: DisplayDeliveryRecord = {
          ...processingRecord,
          errorMessage,
          nextAttemptAt: null,
          status: "failed"
        };
        this.deliveries.set(deliveryId, failedRecord);
        this.logger.error({ deliveryId, err: error }, "Display delivery failed after max retry attempts");
        return;
      }

      const nextAttemptAt = new Date(Date.now() + (this.retryIntervalMs * attemptNumber)).toISOString();
      const retryRecord: DisplayDeliveryRecord = {
        ...processingRecord,
        errorMessage,
        nextAttemptAt,
        status: "retry_waiting"
      };
      this.deliveries.set(deliveryId, retryRecord);
      this.logger.warn(
        { deliveryId, nextAttemptAt, remainingAttempts: this.maxAttempts - attemptNumber },
        "Display delivery failed and will be retried"
      );
    }
  }

  private pruneRetainedDeliveries() {
    while (this.deliveryOrder.length > this.retainedDeliveries) {
      const deliveryId = this.deliveryOrder.pop();

      if (!deliveryId) {
        return;
      }

      this.deliveries.delete(deliveryId);
    }
  }

  private scheduleImmediateDrain() {
    setTimeout(() => {
      void this.drainQueue();
    }, 0);
  }

  private scheduleRetryDrainIfNeeded() {
    if (this.retryTimer) {
      return;
    }

    const nextRetryAt = this.getNextRetryAt();

    if (!nextRetryAt) {
      return;
    }

    const delayMs = Math.max(Date.parse(nextRetryAt) - Date.now(), 0);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.drainQueue();
    }, delayMs);
  }

  private getNextRetryAt(): string | null {
    let nextRetryAt: string | null = null;

    for (const delivery of this.deliveries.values()) {
      if (delivery.status !== "retry_waiting" || !delivery.nextAttemptAt) {
        continue;
      }

      if (!nextRetryAt || Date.parse(delivery.nextAttemptAt) < Date.parse(nextRetryAt)) {
        nextRetryAt = delivery.nextAttemptAt;
      }
    }

    return nextRetryAt;
  }
}


