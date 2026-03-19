import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function extractZipArchive(zipPath: string, destinationDirectory: string): Promise<void> {
  await mkdir(destinationDirectory, { recursive: true });

  if (process.platform === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${escapePowerShellPath(zipPath)}' -DestinationPath '${escapePowerShellPath(destinationDirectory)}' -Force`
    ]);
    return;
  }

  await execFileAsync("unzip", ["-oq", zipPath, "-d", destinationDirectory]);
}

function escapePowerShellPath(value: string): string {
  return value.replace(/'/g, "''");
}
