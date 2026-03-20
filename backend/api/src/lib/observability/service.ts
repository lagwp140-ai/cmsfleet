import { performance } from "node:perf_hooks";

import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";

export type ObservabilityStatus = "pass" | "warn" | "fail";
export type ObservabilityKind = "api" | "dependency" | "pipeline" | "adapter" | "system";

export interface ObservabilityComponentInput {
  details?: Record<string, unknown>;
  kind: ObservabilityKind;
  message: string;
  metrics?: Record<string, number>;
  readiness: boolean;
  status: ObservabilityStatus;
}

export interface ObservabilityComponentSnapshot extends ObservabilityComponentInput {
  component: string;
  observedAt: string;
}

export interface ObservabilityAlert {
  component: string;
  details?: Record<string, unknown>;
  message: string;
  observedAt: string;
  status: Extract<ObservabilityStatus, "warn" | "fail">;
}

export interface ObservabilityAlertSink {
  emit(alert: ObservabilityAlert): Promise<void>;
}

export class StructuredLogAlertSink implements ObservabilityAlertSink {
  constructor(private readonly logger: FastifyBaseLogger) {}

  async emit(alert: ObservabilityAlert): Promise<void> {
    const method = alert.status === "fail" ? this.logger.error.bind(this.logger) : this.logger.warn.bind(this.logger);

    method(
      {
        observabilityAlert: alert
      },
      `Observability alert: ${alert.component}`
    );
  }
}

type ComponentProvider = () => Promise<ObservabilityComponentInput>;

interface CounterSample {
  help: string;
  labels: Record<string, string>;
  name: string;
  type: "counter" | "gauge";
  value: number;
}

interface RequestMetric {
  count: number;
  durationMsSum: number;
}

export class ObservabilityRegistry {
  private readonly alertFingerprints = new Map<string, string>();
  private readonly alertSinks: ObservabilityAlertSink[] = [];
  private readonly componentProviders = new Map<string, ComponentProvider>();
  private readonly counters = new Map<string, number>();
  private readonly requestMetrics = new Map<string, RequestMetric>();
  private readonly startedAtMs = Date.now();
  private componentCache: { expiresAtMs: number; snapshots: ObservabilityComponentSnapshot[] } | null = null;

  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly context: ConfigRuntimeContext,
    private readonly config: CmsConfig
  ) {
    this.registerAlertSink(new StructuredLogAlertSink(logger));
  }

  incrementCounter(name: string, value = 1): void {
    const normalized = sanitizeMetricName(name);
    this.counters.set(normalized, (this.counters.get(normalized) ?? 0) + value);
  }

  observeRequest(input: { durationMs: number; method: string; route: string; statusCode: number }): void {
    const statusClass = `${Math.floor(input.statusCode / 100)}xx`;
    const key = `${input.method}|${input.route}|${statusClass}`;
    const existing = this.requestMetrics.get(key) ?? { count: 0, durationMsSum: 0 };
    existing.count += 1;
    existing.durationMsSum += input.durationMs;
    this.requestMetrics.set(key, existing);

    this.incrementCounter("http_requests_total");

    if (input.statusCode >= 500) {
      this.incrementCounter("http_requests_5xx_total");
    } else if (input.statusCode >= 400) {
      this.incrementCounter("http_requests_4xx_total");
    }
  }

  registerAlertSink(sink: ObservabilityAlertSink): void {
    this.alertSinks.push(sink);
  }

  registerComponentProvider(component: string, provider: ComponentProvider): void {
    this.componentProviders.set(component, provider);
    this.componentCache = null;
  }

  getLivenessSummary(): Record<string, unknown> {
    return {
      environment: this.config.selection.environment,
      operator: this.config.branding.operatorName,
      service: this.context.serviceName,
      startedAt: new Date(this.startedAtMs).toISOString(),
      status: "ok",
      tenant: this.config.tenant.id,
      transportProfile: this.config.selection.transportProfile,
      uptimeSeconds: this.getUptimeSeconds(),
      vehicleProfile: this.config.selection.vehicleProfile
    };
  }

  async getOverview(): Promise<{
    components: ObservabilityComponentSnapshot[];
    metrics: {
      counters: Record<string, number>;
      requestMetrics: Array<{ count: number; durationMsAverage: number; durationMsSum: number; method: string; route: string; statusClass: string }>;
    };
    readiness: {
      ready: boolean;
      status: ObservabilityStatus;
    };
    runtime: Record<string, unknown>;
  }> {
    const components = await this.getComponentSnapshots();
    const readiness = summarizeReadiness(components);

    return {
      components,
      metrics: {
        counters: Object.fromEntries(Array.from(this.counters.entries()).sort(([left], [right]) => left.localeCompare(right))),
        requestMetrics: Array.from(this.requestMetrics.entries()).map(([key, value]) => {
          const [method, route, statusClass] = key.split("|");
          return {
            count: value.count,
            durationMsAverage: value.count > 0 ? Number((value.durationMsSum / value.count).toFixed(2)) : 0,
            durationMsSum: Number(value.durationMsSum.toFixed(2)),
            method: method ?? "GET",
            route: route ?? "/unknown",
            statusClass: statusClass ?? "2xx"
          };
        })
      },
      readiness,
      runtime: {
        ...this.getLivenessSummary(),
        memory: process.memoryUsage()
      }
    };
  }

  async getReadinessSummary(): Promise<{
    components: ObservabilityComponentSnapshot[];
    ready: boolean;
    startedAt: string;
    status: ObservabilityStatus;
    uptimeSeconds: number;
  }> {
    const components = await this.getComponentSnapshots();
    const readiness = summarizeReadiness(components);

    return {
      components,
      ready: readiness.ready,
      startedAt: new Date(this.startedAtMs).toISOString(),
      status: readiness.status,
      uptimeSeconds: this.getUptimeSeconds()
    };
  }

  async renderMetrics(): Promise<string> {
    const componentSnapshots = await this.getComponentSnapshots();
    const lines: string[] = [];
    const samples: CounterSample[] = [];
    const memory = process.memoryUsage();

    samples.push(
      gaugeSample("process_uptime_seconds", this.getUptimeSeconds(), "Process uptime in seconds."),
      gaugeSample("process_memory_bytes", memory.rss, "Process memory usage in bytes.", { kind: "rss" }),
      gaugeSample("process_memory_bytes", memory.heapTotal, "Process memory usage in bytes.", { kind: "heap_total" }),
      gaugeSample("process_memory_bytes", memory.heapUsed, "Process memory usage in bytes.", { kind: "heap_used" }),
      gaugeSample("process_memory_bytes", memory.external, "Process memory usage in bytes.", { kind: "external" })
    );

    if (typeof memory.arrayBuffers === "number") {
      samples.push(gaugeSample("process_memory_bytes", memory.arrayBuffers, "Process memory usage in bytes.", { kind: "array_buffers" }));
    }

    for (const [name, value] of this.counters.entries()) {
      samples.push(counterSample(name, value, `${name} counter.`));
    }

    for (const [key, value] of this.requestMetrics.entries()) {
      const [method, route, statusClass] = key.split("|");
      const labels = {
        method: method ?? "GET",
        route: route ?? "/unknown",
        status_class: statusClass ?? "2xx"
      };
      samples.push(counterSample("http_request_by_route_total", value.count, "HTTP requests by method, route, and status class.", labels));
      samples.push(counterSample("http_request_duration_ms_sum", value.durationMsSum, "HTTP request duration sum in milliseconds.", labels));
      samples.push(counterSample("http_request_duration_ms_count", value.count, "HTTP request duration sample count.", labels));
    }

    for (const snapshot of componentSnapshots) {
      const baseLabels = { component: snapshot.component, kind: snapshot.kind };
      samples.push(gaugeSample("component_ready", snapshot.readiness ? 1 : 0, "Whether the component is ready.", baseLabels));
      samples.push(gaugeSample("component_status", snapshot.status === "pass" ? 1 : 0, "Component pass status.", { ...baseLabels, status: "pass" }));
      samples.push(gaugeSample("component_status", snapshot.status === "warn" ? 1 : 0, "Component warn status.", { ...baseLabels, status: "warn" }));
      samples.push(gaugeSample("component_status", snapshot.status === "fail" ? 1 : 0, "Component fail status.", { ...baseLabels, status: "fail" }));

      for (const [metricName, metricValue] of Object.entries(snapshot.metrics ?? {})) {
        samples.push(gaugeSample(metricName, metricValue, `${metricName} gauge.`, { component: snapshot.component }));
      }
    }

    const grouped = new Map<string, CounterSample[]>();

    for (const sample of samples) {
      const metricName = `cmsfleet_${sanitizeMetricName(sample.name)}`;
      const bucket = grouped.get(metricName) ?? [];
      bucket.push({ ...sample, name: metricName });
      grouped.set(metricName, bucket);
    }

    for (const [metricName, metricSamples] of grouped.entries()) {
      const first = metricSamples[0];
      if (!first) {
        continue;
      }

      lines.push(`# HELP ${metricName} ${first.help}`);
      lines.push(`# TYPE ${metricName} ${first.type}`);

      for (const sample of metricSamples) {
        lines.push(`${sample.name}${formatLabels(sample.labels)} ${formatMetricValue(sample.value)}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }

  private async getComponentSnapshots(): Promise<ObservabilityComponentSnapshot[]> {
    const now = Date.now();

    if (this.componentCache && this.componentCache.expiresAtMs > now) {
      return this.componentCache.snapshots;
    }

    const snapshots: ObservabilityComponentSnapshot[] = [];

    for (const [component, provider] of this.componentProviders.entries()) {
      try {
        const snapshot: ObservabilityComponentSnapshot = {
          ...(await provider()),
          component,
          observedAt: new Date().toISOString()
        };
        snapshots.push(snapshot);
        await this.emitAlertIfNeeded(snapshot);
      } catch (error) {
        const failureSnapshot: ObservabilityComponentSnapshot = {
          component,
          details: {
            error: error instanceof Error ? error.message : String(error)
          },
          kind: "system",
          message: "Observability provider failed.",
          observedAt: new Date().toISOString(),
          readiness: false,
          status: "fail"
        };
        snapshots.push(failureSnapshot);
        await this.emitAlertIfNeeded(failureSnapshot);
        this.logger.error({ component, err: error }, "Observability provider failure");
      }
    }

    snapshots.sort((left, right) => left.component.localeCompare(right.component));
    this.componentCache = {
      expiresAtMs: now + 5000,
      snapshots
    };

    return snapshots;
  }

  private async emitAlertIfNeeded(snapshot: ObservabilityComponentSnapshot): Promise<void> {
    if (snapshot.status === "pass") {
      this.alertFingerprints.delete(snapshot.component);
      return;
    }

    const fingerprint = JSON.stringify({ details: snapshot.details ?? null, message: snapshot.message, status: snapshot.status });
    const previousFingerprint = this.alertFingerprints.get(snapshot.component);

    if (previousFingerprint === fingerprint) {
      return;
    }

    this.alertFingerprints.set(snapshot.component, fingerprint);
    this.incrementCounter(`alerts_${snapshot.status}_total`);

    const alert: ObservabilityAlert = {
      component: snapshot.component,
      details: snapshot.details,
      message: snapshot.message,
      observedAt: snapshot.observedAt,
      status: snapshot.status
    };

    for (const sink of this.alertSinks) {
      await sink.emit(alert);
    }
  }

  private getUptimeSeconds(): number {
    return Number(((Date.now() - this.startedAtMs) / 1000).toFixed(3));
  }
}

function counterSample(name: string, value: number, help: string, labels: Record<string, string> = {}): CounterSample {
  return {
    help,
    labels,
    name,
    type: "counter",
    value
  };
}

function gaugeSample(name: string, value: number, help: string, labels: Record<string, string> = {}): CounterSample {
  return {
    help,
    labels,
    name,
    type: "gauge",
    value
  };
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);

  if (entries.length === 0) {
    return "";
  }

  return `{${entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",")}}`;
}

function formatMetricValue(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function sanitizeMetricName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "metric";
}

function summarizeReadiness(snapshots: ObservabilityComponentSnapshot[]): { ready: boolean; status: ObservabilityStatus } {
  const ready = snapshots.every((snapshot) => snapshot.readiness);

  if (!ready || snapshots.some((snapshot) => snapshot.status === "fail")) {
    return { ready, status: "fail" };
  }

  if (snapshots.some((snapshot) => snapshot.status === "warn")) {
    return { ready, status: "warn" };
  }

  return { ready, status: "pass" };
}

export function getRoutePattern(url: string | undefined): string {
  const value = typeof url === "string" && url.trim() !== "" ? url.trim() : "/unknown";
  return value.split("?")[0] ?? value;
}

export function measureNow(): number {
  return performance.now();
}
