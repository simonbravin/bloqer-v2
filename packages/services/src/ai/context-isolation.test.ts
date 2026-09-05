import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAiProjectId, buildAiExecutionContext } from "./context";
import { ServiceError } from "../types";

describe("resolveAiProjectId isolation", () => {
  it("returns null when no project hint", async () => {
    const ctx = buildAiExecutionContext({
      service: {
        actorUserId: "00000000-0000-0000-0000-000000000001",
        tenantId: "00000000-0000-0000-0000-0000000000aa",
        companyId: null,
        roles: ["VIEWER"],
      },
    });
    assert.equal(await resolveAiProjectId(ctx, null), null);
  });

  it("rejects unknown project UUIDs via requireProjectInTenant (NOT_FOUND or FORBIDDEN)", async () => {
    const ctx = buildAiExecutionContext({
      service: {
        actorUserId: "00000000-0000-0000-0000-000000000001",
        tenantId: "00000000-0000-0000-0000-0000000000aa",
        companyId: null,
        roles: ["OWNER"],
      },
    });
    // Foreign UUID — without DB this still goes to Prisma; skip if DATABASE_URL missing.
    if (!process.env.DATABASE_URL) {
      return;
    }
    await assert.rejects(
      () => resolveAiProjectId(ctx, "00000000-0000-0000-0000-0000000000ff"),
      (err: unknown) =>
        err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"),
    );
  });
});
