import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODULES_UNAVAILABLE_IN_THIS_VERSION,
  TENANT_MODULE_LABEL_ES,
  buildPermissionMatrixGrid,
  getPermissionModuleGroupSections,
  getUnavailablePermissionModulesForUi,
  isPermissionModuleUnavailableInThisVersion,
} from "@bloqer/domain";

test("unavailable modules include the five product-approved keys", () => {
  assert.deepEqual([...MODULES_UNAVAILABLE_IN_THIS_VERSION].sort(), [
    "BANK_RECONCILIATION",
    "CHANGE_ORDERS",
    "CONTRACTS",
    "RFIS",
    "TAXES",
  ]);
});

test("permission matrix sections exclude unavailable modules", () => {
  const sections = getPermissionModuleGroupSections();
  const all = sections.flatMap((s) => s.modules);
  for (const m of MODULES_UNAVAILABLE_IN_THIS_VERSION) {
    assert.equal(all.includes(m), false, `expected ${m} hidden from operable matrix`);
  }
  assert.ok(all.includes("BUDGETS"));
  assert.ok(all.includes("PROCUREMENT"));
});

test("buildPermissionMatrixGrid does not include unavailable modules as columns", () => {
  const grid = buildPermissionMatrixGrid();
  for (const m of MODULES_UNAVAILABLE_IN_THIS_VERSION) {
    assert.equal(grid.modules.includes(m), false);
  }
});

test("getUnavailablePermissionModulesForUi lists labels for UI notice", () => {
  const rows = getUnavailablePermissionModulesForUi();
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => isPermissionModuleUnavailableInThisVersion(r.moduleKey)));
  assert.ok(rows.some((r) => r.moduleKey === "CONTRACTS" && r.labelEs.includes("Contratos")));
  for (const row of rows) {
    assert.equal(row.labelEs, TENANT_MODULE_LABEL_ES[row.moduleKey]);
  }
});

test("BILLING and TENANT_TRANSFER stay operable in matrix (platform-scoped, not hidden)", () => {
  const sections = getPermissionModuleGroupSections();
  const all = sections.flatMap((s) => s.modules);
  assert.ok(all.includes("BILLING"));
  assert.ok(all.includes("TENANT_TRANSFER"));
});
