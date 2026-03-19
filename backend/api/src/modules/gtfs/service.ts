import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";
import type { PoolClient } from "pg";

import { extractZipArchive } from "./archive.js";
import { parseGtfsDirectory } from "./parser.js";
import { GtfsRepository } from "./repository.js";
import type {
  GtfsImportErrorRecord,
  GtfsImportJobRecord,
  GtfsImportPathInput,
  GtfsImportUploadInput,
  GtfsOverview,
  GtfsValidationIssue,
  ParsedGtfsFeed
} from "./types.js";
import { validateParsedGtfsFeed } from "./validator.js";

export class GtfsService {
  constructor(
    private readonly config: CmsConfig,
    private readonly logger: FastifyBaseLogger,
    private readonly repository: GtfsRepository
  ) {}

  async activateDataset(datasetId: string, actorUserId: string | null): Promise<void> {
    const dataset = await this.repository.findDatasetById(datasetId);

    if (!dataset) {
      throw new Error("GTFS dataset not found.");
    }

    const client = await this.repository.connect();

    try {
      await client.query("BEGIN");
      await this.repository.activateDataset(client, datasetId, actorUserId);
      await client.query("COMMIT");
      this.logger.info({ datasetId, actorUserId }, "GTFS dataset activated");
    } catch (error) {
      await rollbackQuietly(client, this.logger);
      throw error;
    } finally {
      client.release();
    }
  }

  async getErrors(jobId: string, limit: number): Promise<GtfsImportErrorRecord[]> {
    return this.repository.listErrors(jobId, limit);
  }

  async getLogs(
    limit: number,
    filters: { search?: string; status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" }
  ): Promise<GtfsImportJobRecord[]> {
    return this.repository.listJobs(limit, filters);
  }

  async getOverview(limit = 20): Promise<GtfsOverview> {
    return this.repository.getOverview(limit);
  }

  async importFromLocalPath(
    input: GtfsImportPathInput,
    requestedByUserId: string | null
  ): Promise<{ datasetId: string | null; jobId: string; status: string }> {
    const resolvedPath = resolve(input.filePath.trim());

    return this.runImport({
      activateOnSuccess: input.activateOnSuccess,
      datasetLabel: normalizeDatasetLabel(input.datasetLabel, resolvedPath),
      fileName: basename(resolvedPath),
      requestedByUserId,
      sourcePath: resolvedPath,
      sourceType: "local_path",
      sourceUri: resolvedPath
    });
  }

  async importFromUpload(
    input: GtfsImportUploadInput,
    requestedByUserId: string | null
  ): Promise<{ datasetId: string | null; jobId: string; status: string }> {
    const workDirectory = await mkdtemp(join(tmpdir(), "cmsfleet-gtfs-upload-"));
    const fileName = sanitizeFileName(input.fileName.trim() || "gtfs-upload.zip");
    const zipPath = join(workDirectory, fileName);
    const zipBuffer = Buffer.from(input.zipBase64, "base64");

    await writeFile(zipPath, zipBuffer);

    return this.runImport({
      activateOnSuccess: input.activateOnSuccess,
      datasetLabel: normalizeDatasetLabel(input.datasetLabel, fileName),
      fileName,
      requestedByUserId,
      sourcePath: zipPath,
      sourceType: "upload",
      sourceUri: `upload://${fileName}`,
      temporaryRoot: workDirectory
    });
  }

  async rollbackDataset(datasetId: string, actorUserId: string | null): Promise<void> {
    await this.activateDataset(datasetId, actorUserId);
  }

  private async runImport(input: {
    activateOnSuccess: boolean;
    datasetLabel: string;
    fileName: string;
    requestedByUserId: string | null;
    sourcePath: string;
    sourceType: "local_path" | "upload";
    sourceUri: string;
    temporaryRoot?: string;
  }): Promise<{ datasetId: string | null; jobId: string; status: string }> {
    const activationMode = input.activateOnSuccess ? "activate_on_success" : "manual";
    const jobId = await this.repository.createImportJob({
      activationMode,
      requestedByUserId: input.requestedByUserId,
      sourceType: input.sourceType,
      sourceUri: input.sourceUri,
      summary: {
        requestedFileName: input.fileName
      }
    });

    let workingDirectory = input.temporaryRoot;

    this.logger.info(
      {
        activationMode,
        jobId,
        requestedByUserId: input.requestedByUserId,
        sourceType: input.sourceType,
        sourceUri: input.sourceUri
      },
      "Starting GTFS import"
    );

    try {
      const preparedImport = await this.prepareImportDirectory(input.sourcePath, workingDirectory);
      workingDirectory = preparedImport.workingDirectory;

      const parsed = await parseGtfsDirectory(preparedImport.importDirectory, this.config.gtfs.agencyId);
      const validationIssues = [...parsed.issues, ...validateParsedGtfsFeed(parsed.feed)];
      const rowCount =
        parsed.feed.routes.length +
        parsed.feed.serviceCalendars.length +
        parsed.feed.serviceCalendarDates.length +
        parsed.feed.stops.length +
        parsed.feed.trips.length +
        parsed.feed.stopTimes.length;
      const errorCount = validationIssues.filter((issue) => issue.severity === "error").length;
      const warningCount = validationIssues.filter((issue) => issue.severity === "warn").length;
      const feedHash = createHash("sha256").update(JSON.stringify(parsed.feed)).digest("hex");

      const client = await this.repository.connect();

      try {
        await client.query("BEGIN");
        await this.repository.updateJob(client, jobId, {
          started: true,
          status: "running"
        });
        await this.repository.clearJobArtifacts(client, jobId);
        await this.repository.stageFeed(client, jobId, parsed.feed);
        await this.repository.insertImportErrors(client, jobId, validationIssues);

        if (errorCount > 0) {
          await this.repository.updateJob(client, jobId, {
            errorMessage: `GTFS validation failed with ${errorCount} error(s).`,
            feedVersion: parsed.feedVersion,
            finished: true,
            routeCount: parsed.feed.routes.length,
            rowsProcessed: rowCount,
            status: "failed",
            stopCount: parsed.feed.stops.length,
            stopTimeCount: parsed.feed.stopTimes.length,
            summary: buildJobSummary(parsed.feed, validationIssues),
            tripCount: parsed.feed.trips.length,
            validationErrorCount: errorCount,
            warningCount
          });
          await client.query("COMMIT");

          this.logger.warn({ errorCount, jobId, warningCount }, "GTFS import failed validation");

          return {
            datasetId: null,
            jobId,
            status: "failed"
          };
        }

        const activeDataset = await this.repository.getActiveDatasetForClient(client);
        const datasetId = await this.repository.createDataset(client, {
          datasetLabel: input.datasetLabel,
          feedHash,
          fileName: input.fileName,
          importJobId: jobId,
          previousDatasetId: activeDataset?.id ?? null,
          sourceType: input.sourceType,
          sourceUri: input.sourceUri,
          summary: buildDatasetSummary(parsed.feed),
          validationSummary: {
            errorCount,
            warningCount
          }
        });
        const counts = await this.repository.loadDataset(client, datasetId, parsed.feed, input.activateOnSuccess);

        if (input.activateOnSuccess) {
          await this.repository.activateDataset(client, datasetId, input.requestedByUserId);
          await this.repository.updateDatasetLifecycle(client, datasetId, {
            activatedByUserId: input.requestedByUserId,
            isActive: true,
            status: "active"
          });
        }

        await this.repository.updateJob(client, jobId, {
          datasetId,
          errorMessage: null,
          feedVersion: parsed.feedVersion,
          finished: true,
          routeCount: counts.routeCount,
          rowsProcessed: rowCount,
          status: "succeeded",
          stopCount: counts.stopCount,
          stopTimeCount: counts.stopTimeCount,
          summary: buildJobSummary(parsed.feed, validationIssues),
          tripCount: counts.tripCount,
          validationErrorCount: errorCount,
          warningCount
        });
        await client.query("COMMIT");

        this.logger.info(
          {
            activateOnSuccess: input.activateOnSuccess,
            datasetId,
            jobId,
            routeCount: counts.routeCount,
            serviceCalendarCount: parsed.feed.serviceCalendars.length,
            serviceCalendarDateCount: parsed.feed.serviceCalendarDates.length,
            stopCount: counts.stopCount,
            stopTimeCount: counts.stopTimeCount,
            tripCount: counts.tripCount,
            warningCount
          },
          "GTFS import completed"
        );

        return {
          datasetId,
          jobId,
          status: "succeeded"
        };
      } catch (error) {
        await rollbackQuietly(client, this.logger);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const client = await this.repository.connect();

      try {
        await client.query("BEGIN");
        await this.repository.updateJob(client, jobId, {
          errorMessage: error instanceof Error ? error.message : String(error),
          finished: true,
          status: "failed"
        });
        await client.query("COMMIT");
      } catch (updateError) {
        await rollbackQuietly(client, this.logger);
        this.logger.error({ err: updateError, jobId }, "Failed to record GTFS import failure state");
      } finally {
        client.release();
      }

      this.logger.error({ err: error, jobId, sourceUri: input.sourceUri }, "GTFS import failed unexpectedly");
      throw error;
    } finally {
      if (workingDirectory) {
        await rm(workingDirectory, { force: true, recursive: true }).catch(() => undefined);
      }
    }
  }

  private async prepareImportDirectory(
    sourcePath: string,
    temporaryRoot: string | undefined
  ): Promise<{ importDirectory: string; workingDirectory: string | undefined }> {
    const metadata = await stat(sourcePath);

    if (metadata.isDirectory()) {
      return {
        importDirectory: sourcePath,
        workingDirectory: temporaryRoot
      };
    }

    if (extname(sourcePath).toLowerCase() !== ".zip") {
      throw new Error("GTFS import source must be a directory or a .zip archive.");
    }

    const workingDirectory = temporaryRoot ?? await mkdtemp(join(tmpdir(), "cmsfleet-gtfs-"));
    await mkdir(workingDirectory, { recursive: true });
    const extractDirectory = join(workingDirectory, "extracted");
    await extractZipArchive(sourcePath, extractDirectory);

    return {
      importDirectory: extractDirectory,
      workingDirectory
    };
  }
}

function buildDatasetSummary(feed: ParsedGtfsFeed): Record<string, unknown> {
  return {
    routeCount: feed.routes.length,
    serviceCalendarCount: feed.serviceCalendars.length,
    serviceCalendarDateCount: feed.serviceCalendarDates.length,
    stopCount: feed.stops.length,
    stopTimeCount: feed.stopTimes.length,
    tripCount: feed.trips.length
  };
}

function buildJobSummary(feed: ParsedGtfsFeed, issues: GtfsValidationIssue[]): Record<string, unknown> {
  return {
    files: {
      routes: feed.routes.length,
      serviceCalendarDates: feed.serviceCalendarDates.length,
      serviceCalendars: feed.serviceCalendars.length,
      stopTimes: feed.stopTimes.length,
      stops: feed.stops.length,
      trips: feed.trips.length
    },
    validation: {
      errorCount: issues.filter((issue) => issue.severity === "error").length,
      warningCount: issues.filter((issue) => issue.severity === "warn").length
    }
  };
}

function normalizeDatasetLabel(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();

  if (trimmed && trimmed !== "") {
    return trimmed;
  }

  return `${fallback.replace(/\.[^.]+$/, "")}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

async function rollbackQuietly(client: PoolClient, logger: FastifyBaseLogger): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    logger.error({ err: error }, "Failed to roll back GTFS transaction");
  }
}

