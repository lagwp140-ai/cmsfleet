import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { parseGtfsDirectory } from "../../../src/modules/gtfs/parser.js";
import { getGtfsFixtureDirectory } from "../../helpers/config.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("GTFS parser", () => {
  it("parses a minimal GTFS fixture into normalized records", async () => {
    const result = await parseGtfsDirectory(getGtfsFixtureDirectory("minimal"), "demo-agency");

    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(result.feed.routes).toHaveLength(1);
    expect(result.feed.stops).toHaveLength(2);
    expect(result.feed.trips).toHaveLength(1);
    expect(result.feed.stopTimes).toHaveLength(2);
    expect(result.feed.serviceCalendars).toHaveLength(1);
  });

  it("reports invalid stop_times rows as validation issues", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "cmsfleet-gtfs-"));
    tempDirectories.push(workingDirectory);
    await cp(getGtfsFixtureDirectory("minimal"), workingDirectory, { recursive: true });
    await writeFile(
      join(workingDirectory, "stop_times.txt"),
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:99:00,08:99:00,STOP1,1\n",
      "utf8"
    );

    const result = await parseGtfsDirectory(workingDirectory, "demo-agency");

    expect(result.feed.stopTimes).toHaveLength(0);
    expect(result.issues.some((issue) => issue.fileName === "stop_times.txt" && issue.severity === "error")).toBe(true);
  });
});
