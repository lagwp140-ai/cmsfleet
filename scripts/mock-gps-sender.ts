import { setTimeout as delay } from "node:timers/promises";

import { loadLocalEnv, readApiBaseUrl } from "./lib/dev-env.js";

interface VehicleTrack {
  coordinates: Array<{ heading: number; latitude: number; longitude: number; speed: number }>;
  vehicleCode: string;
}

const TRACKS: VehicleTrack[] = [
  {
    vehicleCode: "BUS-100",
    coordinates: [
      { heading: 88, latitude: 50.447123, longitude: 30.52245, speed: 0 },
      { heading: 92, latitude: 50.44901, longitude: 30.5231, speed: 24.5 },
      { heading: 96, latitude: 50.45095, longitude: 30.52395, speed: 31.2 },
      { heading: 105, latitude: 50.4532, longitude: 30.5261, speed: 27.8 },
      { heading: 110, latitude: 50.45622, longitude: 30.5311, speed: 14.1 }
    ]
  },
  {
    vehicleCode: "BUS-101",
    coordinates: [
      { heading: 270, latitude: 50.45622, longitude: 30.5311, speed: 0 },
      { heading: 255, latitude: 50.4542, longitude: 30.5282, speed: 18.4 },
      { heading: 248, latitude: 50.4518, longitude: 30.5258, speed: 22.1 },
      { heading: 238, latitude: 50.4499, longitude: 30.5236, speed: 17.3 },
      { heading: 225, latitude: 50.447123, longitude: 30.52245, speed: 0 }
    ]
  },
  {
    vehicleCode: "BUS-A1",
    coordinates: [
      { heading: 210, latitude: 50.447123, longitude: 30.52245, speed: 0 },
      { heading: 212, latitude: 50.4388, longitude: 30.5089, speed: 36.8 },
      { heading: 216, latitude: 50.4271, longitude: 30.4897, speed: 42.5 },
      { heading: 220, latitude: 50.4135, longitude: 30.468, speed: 39.9 },
      { heading: 224, latitude: 50.40121, longitude: 30.45198, speed: 0 }
    ]
  }
];

loadLocalEnv();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const apiBaseUrl = options.apiBaseUrl ?? readApiBaseUrl();
  const intervalMs = options.intervalMs ?? 2500;
  const iterations = options.once ? 1 : options.iterations ?? 20;
  const selectedTracks = options.vehicleCodes.length > 0
    ? TRACKS.filter((track) => options.vehicleCodes.includes(track.vehicleCode))
    : TRACKS;

  if (selectedTracks.length === 0) {
    throw new Error("No matching vehicles were found for the requested mock GPS run.");
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const timestamp = new Date(Date.now() + iteration * 1000).toISOString();

    for (const track of selectedTracks) {
      const point = track.coordinates[iteration % track.coordinates.length]!;
      const payload = {
        heading: point.heading,
        latitude: point.latitude,
        longitude: point.longitude,
        speed: point.speed,
        timestamp,
        unitCode: track.vehicleCode,
        vehicleId: track.vehicleCode
      };
      const response = await fetch(`${apiBaseUrl}/api/ingest/gps/http`, {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const body = await response.json().catch(() => ({}));
      console.info(
        `[gps] ${track.vehicleCode} -> ${response.status} ${body?.data?.message ?? body?.message ?? "ok"}`
      );
    }

    if (iteration < iterations - 1) {
      await delay(intervalMs);
    }
  }

  console.info(`Mock GPS sender finished after ${iterations} iteration(s).`);
}

function parseOptions(argumentsList: string[]): {
  apiBaseUrl?: string;
  intervalMs?: number;
  iterations?: number;
  once: boolean;
  vehicleCodes: string[];
} {
  const options = {
    apiBaseUrl: undefined as string | undefined,
    intervalMs: undefined as number | undefined,
    iterations: undefined as number | undefined,
    once: false,
    vehicleCodes: [] as string[]
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const current = argumentsList[index];

    switch (current) {
      case "--api-base-url":
        options.apiBaseUrl = argumentsList[index + 1];
        index += 1;
        break;
      case "--interval-ms":
        options.intervalMs = Number(argumentsList[index + 1]);
        index += 1;
        break;
      case "--iterations":
        options.iterations = Number(argumentsList[index + 1]);
        index += 1;
        break;
      case "--once":
        options.once = true;
        break;
      case "--vehicle":
        if (argumentsList[index + 1]) {
          options.vehicleCodes.push(argumentsList[index + 1]);
        }
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}
