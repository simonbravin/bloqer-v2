import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canEditScheduleArea, canViewScheduleArea, resolveEnsureScheduleCreatePolicy } from "./schedule-access";

describe("schedule-access", () => {
  it("VIEWER can consult and cannot mutate", () => {
    assert.equal(canViewScheduleArea(["VIEWER"]), true);
    assert.equal(canEditScheduleArea(["VIEWER"]), false);
  });

  it("PROJECT_VIEWER can consult and cannot mutate", () => {
    assert.equal(canViewScheduleArea(["PROJECT_VIEWER"]), true);
    assert.equal(canEditScheduleArea(["PROJECT_VIEWER"]), false);
  });

  it("PROJECT_MANAGER and OWNER can edit", () => {
    assert.equal(canEditScheduleArea(["PROJECT_MANAGER"]), true);
    assert.equal(canEditScheduleArea(["OWNER"]), true);
  });

  it("SITE_FOREMAN can view via PROJECTS, cannot edit schedule", () => {
    assert.equal(canViewScheduleArea(["SITE_FOREMAN"]), true);
    assert.equal(canEditScheduleArea(["SITE_FOREMAN"]), false);
  });

  it("empty roles cannot view or edit", () => {
    assert.equal(canViewScheduleArea([]), false);
    assert.equal(canEditScheduleArea([]), false);
  });

  it("VIEWER cannot create schedule when missing; can reuse existing", () => {
    assert.equal(resolveEnsureScheduleCreatePolicy(false, ["VIEWER"]), "forbid_create");
    assert.equal(resolveEnsureScheduleCreatePolicy(true, ["VIEWER"]), "reuse");
  });

  it("PROJECT_MANAGER can create schedule when missing", () => {
    assert.equal(resolveEnsureScheduleCreatePolicy(false, ["PROJECT_MANAGER"]), "create");
  });
});
