import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DeviceConfig, LedDisplayConfig, TransportConfig } from "@cmsfleet/config-runtime";
import type { Pool } from "pg";

import type { TransportProfileCatalogItem } from "./types.js";

interface DeviceProfileFile {
  device: DeviceConfig;
}

interface DisplayProfileFile {
  ledDisplay: LedDisplayConfig;
}

interface TransportProfileFile {
  transport: TransportConfig;
}

export async function syncProfileCatalogs(pool: Pool, configDirectory: string): Promise<void> {
  const deviceProfiles = readDeviceProfiles(configDirectory);
  const displayProfiles = readDisplayProfiles(configDirectory);

  for (const profile of deviceProfiles) {
    await pool.query(
      `
        INSERT INTO fleet.device_profiles (
          profile_key,
          label,
          platform,
          operating_system,
          connectivity,
          capabilities,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (profile_key) DO UPDATE
        SET label = EXCLUDED.label,
            platform = EXCLUDED.platform,
            operating_system = EXCLUDED.operating_system,
            connectivity = EXCLUDED.connectivity,
            capabilities = EXCLUDED.capabilities,
            updated_at = NOW()
      `,
      [
        profile.profileId,
        formatProfileLabel(profile.profileId),
        profile.platform,
        profile.operatingSystem,
        profile.connectivity,
        {
          source: "config-profile",
          syncedFrom: "config/cms/device-profiles"
        }
      ]
    );
  }

  for (const profile of displayProfiles) {
    await pool.query(
      `
        INSERT INTO fleet.display_profiles (
          profile_key,
          label,
          provider,
          controller,
          brightness_percent,
          destination_template,
          mappings,
          capabilities,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (profile_key) DO UPDATE
        SET label = EXCLUDED.label,
            provider = EXCLUDED.provider,
            controller = EXCLUDED.controller,
            brightness_percent = EXCLUDED.brightness_percent,
            destination_template = EXCLUDED.destination_template,
            mappings = EXCLUDED.mappings,
            capabilities = EXCLUDED.capabilities,
            updated_at = NOW()
      `,
      [
        profile.profileId,
        formatProfileLabel(profile.profileId),
        profile.provider,
        profile.controller,
        profile.brightness,
        profile.destinationTemplate,
        profile.mappings,
        {
          source: "config-profile",
          syncedFrom: "config/cms/display-profiles"
        }
      ]
    );
  }
}

export function readTransportProfileCatalog(configDirectory: string): TransportProfileCatalogItem[] {
  const directory = join(configDirectory, "transport-profiles");
  const fileNames = readdirSync(directory).filter((fileName) => fileName.endsWith(".json")).sort();

  return fileNames.map((fileName) => {
    const key = fileName.replace(/\.json$/i, "");
    const parsed = JSON.parse(readFileSync(join(directory, fileName), "utf8")) as TransportProfileFile;

    if (!parsed.transport || typeof parsed.transport !== "object") {
      throw new Error(`Transport profile file is missing a transport object: ${fileName}`);
    }

    return {
      key,
      label: formatProfileLabel(key),
      mode: parsed.transport.mode,
      routeStrategyType: parsed.transport.routeStrategy.type,
      serviceArea: parsed.transport.serviceArea
    };
  });
}

function readDeviceProfiles(configDirectory: string): DeviceConfig[] {
  const directory = join(configDirectory, "device-profiles");
  const fileNames = readdirSync(directory).filter((fileName) => fileName.endsWith(".json")).sort();

  return fileNames.map((fileName) => {
    const parsed = JSON.parse(readFileSync(join(directory, fileName), "utf8")) as DeviceProfileFile;

    if (!parsed.device || typeof parsed.device !== "object") {
      throw new Error(`Device profile file is missing a device object: ${fileName}`);
    }

    return parsed.device;
  });
}

function readDisplayProfiles(configDirectory: string): LedDisplayConfig[] {
  const directory = join(configDirectory, "display-profiles");
  const fileNames = readdirSync(directory).filter((fileName) => fileName.endsWith(".json")).sort();

  return fileNames.map((fileName) => {
    const parsed = JSON.parse(readFileSync(join(directory, fileName), "utf8")) as DisplayProfileFile;

    if (!parsed.ledDisplay || typeof parsed.ledDisplay !== "object") {
      throw new Error(`Display profile file is missing a ledDisplay object: ${fileName}`);
    }

    return parsed.ledDisplay;
  });
}

function formatProfileLabel(profileKey: string): string {
  return profileKey
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}
