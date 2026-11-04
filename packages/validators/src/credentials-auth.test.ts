import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loginWithEmailPasswordSchema,
  passwordSchema,
  registerWithEmailPasswordSchema,
  resetPasswordWithTokenSchema,
} from "./credentials-auth";

describe("credentials password byte limit", () => {
  it("accepts passwords up to the complete bcrypt UTF-8 boundary", () => {
    assert.equal(passwordSchema.safeParse(`a1${"x".repeat(70)}`).success, true);
    assert.equal(passwordSchema.safeParse(`a1${"é".repeat(35)}`).success, true);
    assert.equal(passwordSchema.safeParse(`a1${"😀".repeat(17)}`).success, true);
  });

  for (const password of [`a1${"é".repeat(36)}`, `a1${"😀".repeat(18)}`]) {
    it(`rejects ${new TextEncoder().encode(password).length} UTF-8 bytes for registration and reset`, () => {
      assert.equal(password.length <= 72, true);
      assert.equal(registerWithEmailPasswordSchema.safeParse({
        email: "person@example.com", password, confirmPassword: password,
      }).success, false);
      assert.equal(resetPasswordWithTokenSchema.safeParse({
        token: "a".repeat(43), password, confirmPassword: password,
      }).success, false);
    });
  }

  it("keeps existing Unicode passwords available at login", () => {
    assert.equal(loginWithEmailPasswordSchema.safeParse({
      email: "person@example.com", password: `a1${"é".repeat(36)}`,
    }).success, true);
  });

  it("rejects malformed Unicode without throwing", () => {
    assert.equal(passwordSchema.safeParse(`password123\uD800`).success, false);
  });
});
