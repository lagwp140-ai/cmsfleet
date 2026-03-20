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

  try {
    await execFileAsync("unzip", ["-oq", zipPath, "-d", destinationDirectory]);
    return;
  } catch (error) {
    if (!isCommandMissing(error)) {
      throw error;
    }
  }

  const pythonCommand = await resolvePythonCommand();

  if (!pythonCommand) {
    throw new Error("Failed to extract GTFS zip: neither unzip nor python3/python is available on this host.");
  }

  await execFileAsync(pythonCommand, [
    "-c",
    [
      "import sys, zipfile",
      "zip_path, destination = sys.argv[1], sys.argv[2]",
      "with zipfile.ZipFile(zip_path) as archive:",
      "    archive.extractall(destination)"
    ].join("\n"),
    zipPath,
    destinationDirectory
  ]);
}

function escapePowerShellPath(value: string): string {
  return value.replace(/'/g, "''");
}

function isCommandMissing(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && String((error as { code?: unknown }).code ?? "") === "ENOENT";
}

async function resolvePythonCommand(): Promise<string | null> {
  for (const command of ["python3", "python"]) {
    try {
      await execFileAsync(command, ["--version"]);
      return command;
    } catch (error) {
      if (!isCommandMissing(error)) {
        return command;
      }
    }
  }

  return null;
}
