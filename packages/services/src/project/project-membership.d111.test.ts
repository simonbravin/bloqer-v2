import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { can } from "@bloqer/domain";
import { hasTenantWideProjectAccess } from "../security/access";

/**
 * Pure policy checks for D-111 Phase C UI gates (no DB).
 * Live membership CRUD is covered by d111-scoped-live + service integration.
 */
describe("D-111 Phase C admin gates", () => {
  it("membership admin requires EDIT USERS_PERMISSIONS", () => {
    assert.equal(can(["OWNER"], "EDIT", "USERS_PERMISSIONS"), true);
    assert.equal(can(["ADMIN"], "EDIT", "USERS_PERMISSIONS"), true);
    assert.equal(can(["PROJECT_MANAGER"], "EDIT", "USERS_PERMISSIONS"), false);
    assert.equal(can(["VIEWER"], "EDIT", "USERS_PERMISSIONS"), false);
  });

  it("mode change uses tenant-wide helper, not role === OWNER string", () => {
    assert.equal(hasTenantWideProjectAccess(["OWNER"]), true);
    assert.equal(hasTenantWideProjectAccess(["ADMIN"]), true);
    assert.equal(hasTenantWideProjectAccess(["FINANCE"]), false);
    assert.equal(hasTenantWideProjectAccess(["PROJECT_MANAGER"]), false);
  });

  it("VIEWER still has no TREASURY (capability ≠ membership)", () => {
    assert.equal(can(["VIEWER"], "VIEW", "TREASURY"), false);
    assert.equal(can(["VIEWER"], "VIEW", "PROJECTS"), true);
  });
});
