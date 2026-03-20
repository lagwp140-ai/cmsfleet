import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { repoRoot } from "./lib/dev-env.js";

const files = [
  { target: ".env", template: ".env.example" },
  { target: "backend/api/.env", template: "backend/api/.env.example" },
  { target: "frontend/web/.env", template: "frontend/web/.env.example" }
] as const;

const created: string[] = [];
const existing: string[] = [];

for (const file of files) {
  const targetPath = resolve(repoRoot, file.target);
  const templatePath = resolve(repoRoot, file.template);

  if (existsSync(targetPath)) {
    existing.push(file.target);
    continue;
  }

  copyFileSync(templatePath, targetPath);
  created.push(file.target);
}

console.info("Local development environment prepared.");

if (created.length > 0) {
  console.info(`Created: ${created.join(", ")}`);
}

if (existing.length > 0) {
  console.info(`Already present: ${existing.join(", ")}`);
}

console.info("Next commands:");
console.info("1. npm run dev:stack:up");
console.info("2. npm run dev:db:migrate");
console.info("3. npm run dev:seed");
console.info("4. npm run dev:start");
console.info("Optional mocks: npm run dev:gps:send and npm run dev:display:watch");