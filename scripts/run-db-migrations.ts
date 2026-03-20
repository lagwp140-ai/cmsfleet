import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

import { loadLocalEnv, repoRoot, requireEnvironmentVariable } from "./lib/dev-env.js";

loadLocalEnv();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const direction = readDirection(process.argv[2]);
  const startAt = readStartAt(process.argv[3]);
  const migrationsDirectory = join(repoRoot, "backend", "api", "db", "migrations");
  const connectionString =
    process.env.CMS_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    requireEnvironmentVariable("CMS_DATABASE_URL");
  const pool = new Pool({ connectionString });

  try {
    const suffix = direction === "down" ? ".down.sql" : ".up.sql";
    const migrationFiles = readdirSync(migrationsDirectory)
      .filter((fileName) => fileName.endsWith(suffix))
      .sort((left, right) => direction === "down" ? right.localeCompare(left) : left.localeCompare(right));

    const selectedFiles = startAt ? migrationFiles.filter((fileName) => matchesStartAt(fileName, startAt, direction)) : migrationFiles;

    if (selectedFiles.length === 0) {
      console.info(
        startAt
          ? `No ${direction} migrations found in ${migrationsDirectory} starting at ${startAt}.`
          : `No ${direction} migrations found in ${migrationsDirectory}.`
      );
      return;
    }

    for (const fileName of selectedFiles) {
      const filePath = join(migrationsDirectory, fileName);
      const sql = stripUtf8Bom(readFileSync(filePath, "utf8"));
      console.info(`Applying ${fileName} ...`);
      await pool.query(sql);
    }

    console.info(`Applied ${selectedFiles.length} ${direction} migration file(s).`);
  } finally {
    await pool.end();
  }
}

function matchesStartAt(fileName: string, startAt: string, direction: "down" | "up"): boolean {
  return direction === "down" ? fileName.localeCompare(startAt) <= 0 : fileName.localeCompare(startAt) >= 0;
}

function readDirection(value: string | undefined): "down" | "up" {
  if (value === undefined || value === "up") {
    return "up";
  }

  if (value === "down") {
    return "down";
  }

  throw new Error(`Unsupported migration direction: ${value}. Use 'up' or 'down'.`);
}

function readStartAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function stripUtf8Bom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}
