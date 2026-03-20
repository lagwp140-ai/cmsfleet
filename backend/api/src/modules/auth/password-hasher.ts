import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { CmsConfig } from "@cmsfleet/config-runtime";

const pbkdf2 = promisify(pbkdf2Callback);
const LOWERCASE_CHARS = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMBER_CHARS = "23456789";
const SYMBOL_CHARS = "!@$%*-_";
const TEMPORARY_PASSWORD_ALPHABET = `${UPPERCASE_CHARS}${LOWERCASE_CHARS}${NUMBER_CHARS}${SYMBOL_CHARS}`;

type PasswordPolicy = CmsConfig["auth"]["passwordPolicy"];

export async function hashPassword(
  plainText: string,
  policy: PasswordPolicy
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

export function generateTemporaryPassword(policy: PasswordPolicy): string {
  const targetLength = Math.min(policy.maxLength, Math.max(16, policy.minLength));
  const characters: string[] = [];

  if (policy.requireUppercase) {
    characters.push(randomCharacter(UPPERCASE_CHARS));
  }

  if (policy.requireLowercase) {
    characters.push(randomCharacter(LOWERCASE_CHARS));
  }

  if (policy.requireNumber) {
    characters.push(randomCharacter(NUMBER_CHARS));
  }

  if (policy.requireSymbol) {
    characters.push(randomCharacter(SYMBOL_CHARS));
  }

  while (characters.length < targetLength) {
    characters.push(randomCharacter(TEMPORARY_PASSWORD_ALPHABET));
  }

  return shuffle(characters).join("");
}

export function validatePasswordPolicy(plainText: string, policy: PasswordPolicy): string[] {
  const issues: string[] = [];

  if (plainText.length < policy.minLength) {
    issues.push(`Password must be at least ${policy.minLength} characters long.`);
  }

  if (plainText.length > policy.maxLength) {
    issues.push(`Password must be at most ${policy.maxLength} characters long.`);
  }

  if (policy.requireLowercase && !/[a-z]/.test(plainText)) {
    issues.push("Password must include at least one lowercase letter.");
  }

  if (policy.requireUppercase && !/[A-Z]/.test(plainText)) {
    issues.push("Password must include at least one uppercase letter.");
  }

  if (policy.requireNumber && !/[0-9]/.test(plainText)) {
    issues.push("Password must include at least one number.");
  }

  if (policy.requireSymbol && !/[!@$%*\-_]/.test(plainText)) {
    issues.push("Password must include at least one symbol (! @ $ % * - _).");
  }

  return issues;
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

function randomCharacter(alphabet: string): string {
  const randomBuffer = randomBytes(1);
  const alphabetIndex = randomBuffer[0] ?? 0;
  return alphabet[alphabetIndex % alphabet.length] ?? alphabet[0] ?? "A";
}

function shuffle(characters: string[]): string[] {
  const shuffled = [...characters];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = (randomBytes(1)[0] ?? 0) % (index + 1);
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex] ?? current;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}
