import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceError } from "../types";
import { getProjectScheduleFieldWorkspace } from "./schedule-field-workspace.service";

describe("getProjectScheduleFieldWorkspace permissions", () => {
  it("rejects empty roles before I/O", async () => {
    await assert.rejects(
      () =>
        getProjectScheduleFieldWorkspace("a0000010-0000-4000-8000-000000000010", {
          actorUserId: "user",
          tenantId: "tenant",
          companyId: "company",
          roles: [],
        }),
      (err: unknown) =>
        err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });
});
