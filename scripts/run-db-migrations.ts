import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

import { loadLocalEnv, repoRoot, requireEnvironmentVariable } from "./lib/dev-env.js";

const direction = readDirection(process.argv[2]);
const migrationsDirectory = join(repoRoot, "backend", "api", "db", "migrations");

loadLocalEnv();

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

  if (migrationFiles.length === 0) {
    console.info(`No ${direction} migrations found in ${migrationsDirectory}.`);
    process.exit(0);
  }

  for (const fileName of migrationFiles) {
    const filePath = join(migrationsDirectory, fileName);
    const sql = readFileSync(filePath, "utf8");
    console.info(`Applying ${fileName} ...`);
    await pool.query(sql);
  }

  console.info(`Applied ${migrationFiles.length} ${direction} migration file(s).`);
} finally {
  await pool.end();
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