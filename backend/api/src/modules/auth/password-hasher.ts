import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { CmsConfig } from "@cmsfleet/config-runtime";

const pbkdf2 = promisify(pbkdf2Callback);
const TEMPORARY_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*-_";

export async function hashPassword(
  plainText: string,
  policy: CmsConfig["auth"]["passwordPolicy"]
): Promise<string> {
  const salt = randomBytes(policy.saltLength);
  const derivedKey = await pbkdf2(plainText, salt, policy.iterations, policy.keyLength, "sha512");

  return [
    policy.algorithm,
    String(policy.iterations),
    salt.toString("base64"),
    derivedKey.toString("base64")
  ].join("$");
}

export function generateTemporaryPassword(minLength: number): string {
  const targetLength = Math.max(16, minLength);
  const randomBuffer = randomBytes(targetLength);
  let password = "";

  for (let index = 0; index < targetLength; index += 1) {
    const alphabetIndex = randomBuffer[index] ?? 0;
    password += TEMPORARY_PASSWORD_ALPHABET[alphabetIndex % TEMPORARY_PASSWORD_ALPHABET.length] ?? "A";
  }

  return password;
}

export async function verifyPassword(plainText: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterationsRaw, saltBase64, hashBase64] = storedHash.split("$");

  if (algorithm !== "pbkdf2_sha512") {
    return false;
  }

  if (!saltBase64 || !hashBase64) {
    return false;
  }

  const iterations = Number(iterationsRaw);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const salt = Buffer.from(saltBase64, "base64");
  const expectedHash = Buffer.from(hashBase64, "base64");
  const actualHash = await pbkdf2(plainText, salt, iterations, expectedHash.length, "sha512");

  if (actualHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expectedHash);
}
