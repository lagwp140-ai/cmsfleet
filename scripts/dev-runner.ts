import { spawn, type ChildProcess } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const argumentsList = new Set(process.argv.slice(2));
const services = [
  !argumentsList.has("--no-api")
    ? {
        args: ["--workspace", "@cmsfleet/backend-api", "run", "dev"],
        name: "api"
      }
    : null,
  !argumentsList.has("--no-web")
    ? {
        args: ["--workspace", "@cmsfleet/frontend-web", "run", "dev"],
        name: "web"
      }
    : null,
  !argumentsList.has("--no-worker")
    ? {
        args: ["--workspace", "@cmsfleet/integration-worker", "run", "dev"],
        name: "worker"
      }
    : null
].filter((service): service is { args: string[]; name: string } => service !== null);

if (services.length === 0) {
  throw new Error("No services selected for dev:start. Remove one of the --no-* flags.");
}

const children: ChildProcess[] = [];
let shuttingDown = false;

for (const service of services) {
  const child = spawn(npmCommand, service.args, {
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"]
  });
  children.push(child);
  pipeStream(service.name, child.stdout);
  pipeStream(service.name, child.stderr);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.error(`[${service.name}] exited with code=${code ?? "null"} signal=${signal ?? "null"}`);
    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => {
  shutdown(0);
});
process.on("SIGTERM", () => {
  shutdown(0);
});

function pipeStream(label: string, stream: NodeJS.ReadableStream | null): void {
  if (!stream) {
    return;
  }

  stream.on("data", (chunk) => {
    const text = String(chunk)
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "");

    for (const line of text) {
      console.info(`[${label}] ${line}`);
    }
  });
}

function shutdown(exitCode: number): void {
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 200).unref();
}