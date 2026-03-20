import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotEnv } from "dotenv";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const DEFAULT_ENV_FILES = [
  ".env",
  "backend/api/.env",
  "frontend/web/.env",
  "services/integration-worker/.env"
] as const;

export function loadLocalEnv(files: readonly string[] = DEFAULT_ENV_FILES): string[] {
  const loadedFiles: string[] = [];

  for (const relativePath of files) {
    const absolutePath = resolve(repoRoot, relativePath);

    if (!existsSync(absolutePath)) {
      continue;
    }

    loadDotEnv({
      override: false,
      path: absolutePath
    });
    loadedFiles.push(absolutePath);
  }

  return loadedFiles;
}

export function readApiBaseUrl(): string {
  const value =
    process.env.CMSFLEET_API_BASE_URL ??
    process.env.VITE_API_BASE_URL ??
    "http://localhost:3000";

  return value.replace(/\/$/, "");
}

export function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}