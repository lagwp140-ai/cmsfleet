import { describe, expect, it } from "vitest";

import {
  generateTemporaryPassword,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword
} from "../../../src/modules/auth/password-hasher.js";
import { createTestRuntime } from "../../helpers/config.js";

describe("password hasher", () => {
  it("hashes and verifies passwords using the configured policy", async () => {
    const { config } = createTestRuntime("local");
    const password = "Transit!Admin2026";

    const storedHash = await hashPassword(password, config.auth.passwordPolicy);

    expect(storedHash).toContain("pbkdf2_sha512$");
    await expect(verifyPassword(password, storedHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", storedHash)).resolves.toBe(false);
  });

  it("generates a temporary password that satisfies the configured password policy", () => {
    const { config } = createTestRuntime("local");
    const generated = generateTemporaryPassword(config.auth.passwordPolicy);

    expect(generated.length).toBeGreaterThanOrEqual(16);
    expect(validatePasswordPolicy(generated, config.auth.passwordPolicy)).toEqual([]);
  });
});
