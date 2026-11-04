import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@bloqer/database";

import { resolveAiProjectId, buildAiExecutionContext } from "./context";
import { ServiceError } from "../types";

// Unit checks stub the project read; SQL isolation belongs to the opt-in live suites.
describe("resolveAiProjectId isolation", { concurrency: false }, () => {
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

  for (const scenario of [
    { name: "missing project", project: null, code: "NOT_FOUND" },
    {
      name: "project belonging to another tenant",
      project: {
        id: "00000000-0000-0000-0000-0000000000ff",
        tenantId: "00000000-0000-0000-0000-0000000000bb",
        status: "ACTIVE",
        companyId: null,
        country: "AR",
      },
      code: "FORBIDDEN",
    },
  ]) {
    it(`rejects ${scenario.name} with ${scenario.code} without a database connection`, async (t) => {
      const ctx = buildAiExecutionContext({
        service: {
          actorUserId: "00000000-0000-0000-0000-000000000001",
          tenantId: "00000000-0000-0000-0000-0000000000aa",
          companyId: null,
          roles: ["OWNER"],
        },
      });
      const projectId = "00000000-0000-0000-0000-0000000000ff";
      const originalFindUnique = prisma.project.findUnique;
      const lookup = t.mock.fn(async () => scenario.project);
      // Prisma delegates are dynamic proxies; restore the stub after each case.
      prisma.project.findUnique = lookup as unknown as typeof originalFindUnique;
      t.after(() => {
        prisma.project.findUnique = originalFindUnique;
      });

      await assert.rejects(
        () => resolveAiProjectId(ctx, projectId),
        (err: unknown) => err instanceof ServiceError && err.code === scenario.code,
      );
      assert.equal(lookup.mock.callCount(), 1);
    });
  }
});
