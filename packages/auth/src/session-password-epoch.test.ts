import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSignInPasswordEpoch } from "./session-password-epoch";

describe("sign-in password reset revocation", () => {
  it("keeps the authenticated credentials epoch when a reset finishes during login", async () => {
    const authenticatedAt = new Date("2026-11-01T12:00:00.000Z");
    const resetAt = new Date("2026-11-01T12:00:01.000Z");
    let databaseReads = 0;
    const epoch = await resolveSignInPasswordEpoch("credentials", {
      id: "user", passwordUpdatedAt: authenticatedAt,
    }, async () => { databaseReads++; return resetAt; });
    assert.equal(databaseReads, 0);
    assert.equal(epoch, authenticatedAt.toISOString());
    assert.notEqual(epoch, resetAt.toISOString());
  });

  it("preserves the null epoch of a first credentials password", async () => {
    const epoch = await resolveSignInPasswordEpoch("credentials", {
      id: "user", passwordUpdatedAt: null,
    }, async () => { throw new Error("Credentials must not refresh the epoch"); });
    assert.equal(epoch, null);
  });

  it("loads the current epoch after OAuth account linking", async () => {
    const resetAt = new Date("2026-11-01T12:00:01.000Z");
    const epoch = await resolveSignInPasswordEpoch("google", { id: "user" }, async (userId) => {
      assert.equal(userId, "user");
      return resetAt;
    });
    assert.equal(epoch, resetAt.toISOString());
  });

  it("propagates an OAuth epoch read failure to the callback policy", async () => {
    await assert.rejects(() => resolveSignInPasswordEpoch("google", { id: "user" }, async () => {
      throw new Error("database unavailable");
    }), /database unavailable/);
  });
});
