import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceError } from "../types";
import { getProjectMaterialsBoard } from "./project-materials-board.service";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { can } from "@bloqer/domain";

describe("getProjectMaterialsBoard permissions", () => {
  it("rejects empty roles before I/O", async () => {
    await assert.rejects(
      () =>
        getProjectMaterialsBoard(
          "a0000010-0000-4000-8000-000000000010",
          { window: "all" },
          {
            actorUserId: "user",
            tenantId: "tenant",
            companyId: "company",
            roles: [],
          },
        ),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });

  it("OWNER and VIEWER can consult; VIEWER has no EDIT PURCHASE_REQUESTS", () => {
    assert.equal(canViewProjectCostControlReport(["OWNER"]), true);
    assert.equal(canViewProjectCostControlReport(["VIEWER"]), true);
    assert.equal(canViewProjectCostControlReport(["PROJECT_MANAGER"]), true);
    assert.equal(can(["VIEWER"], "EDIT", "PURCHASE_REQUESTS"), false);
    assert.equal(can(["OWNER"], "EDIT", "PURCHASE_REQUESTS"), true);
  });
});
