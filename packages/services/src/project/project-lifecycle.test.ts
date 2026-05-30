import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageProjectLifecycleAdmin } from "@bloqer/domain";
import {
  canCancelActiveProject,
  canCancelDraftProject,
  canReactivateProject,
} from "./project-lifecycle-access";
import { getProjectOperationalMutationBlockReason } from "./project-operational-guard";
import { sanitizeReactivationTargetStatus } from "./project-cancellation-impact.service";

test("canManageProjectLifecycleAdmin — OWNER and ADMIN only", () => {
  assert.equal(canManageProjectLifecycleAdmin(["OWNER"]), true);
  assert.equal(canManageProjectLifecycleAdmin(["ADMIN"]), true);
  assert.equal(canManageProjectLifecycleAdmin(["PROJECT_MANAGER"]), false);
  assert.equal(canManageProjectLifecycleAdmin(["FINANCE"]), false);
});

test("canCancelActiveProject and canReactivateProject follow PERM-007", () => {
  assert.equal(canCancelActiveProject(["ADMIN"]), true);
  assert.equal(canReactivateProject(["OWNER"]), true);
  assert.equal(canCancelActiveProject(["PROJECT_MANAGER"]), false);
  assert.equal(canReactivateProject(["PROJECT_MANAGER"]), false);
});

test("canCancelDraftProject — EDIT PROJECTS via PM", () => {
  assert.equal(canCancelDraftProject(["PROJECT_MANAGER"]), true);
  assert.equal(canCancelDraftProject(["VIEWER"]), false);
});

test("getProjectOperationalMutationBlockReason — only ACTIVE allows mutations", () => {
  assert.equal(getProjectOperationalMutationBlockReason("ACTIVE"), null);
  assert.ok(getProjectOperationalMutationBlockReason("DRAFT")?.includes("borrador"));
  assert.ok(getProjectOperationalMutationBlockReason("ON_HOLD")?.includes("pausada"));
  assert.ok(getProjectOperationalMutationBlockReason("CANCELLED")?.includes("cancelada"));
  assert.ok(getProjectOperationalMutationBlockReason("COMPLETED")?.includes("completada"));
});

test("sanitizeReactivationTargetStatus — rejects terminal stored states", () => {
  assert.equal(sanitizeReactivationTargetStatus("ACTIVE"), "ACTIVE");
  assert.equal(sanitizeReactivationTargetStatus("COMPLETED"), null);
  assert.equal(sanitizeReactivationTargetStatus("CANCELLED"), null);
});
