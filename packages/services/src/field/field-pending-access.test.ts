import { can } from "@bloqer/domain";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceError } from "../types";
import { createTenantModuleGate } from "../tenant-modules/tenant-module-gate";
import { fieldPendingSourceAllowed, fieldPendingSourcesForActor, parseFieldPendingGroup, resolveFieldPendingProjectFilter } from "./field-pending-access";

const allOn = createTenantModuleGate(new Map());

test("OWNER can query PO, jobsite log, client cert and subcontract cert pendings", () => {
  const sources = fieldPendingSourcesForActor(["OWNER"], allOn);
  assert.deepEqual(sources, [
    "PURCHASE_ORDER",
    "JOBSITE_LOG",
    "CERTIFICATION",
    "SUBCONTRACT_CERTIFICATION",
  ]);
});

test("PROJECT_MANAGER cannot query purchase orders awaiting approval", () => {
  const sources = fieldPendingSourcesForActor(["PROJECT_MANAGER"], allOn);
  assert.equal(sources.includes("PURCHASE_ORDER"), false);
  assert.equal(fieldPendingSourceAllowed(["PROJECT_MANAGER"], allOn, "PURCHASE_ORDER"), false);
  assert.equal(sources.includes("JOBSITE_LOG"), true);
  assert.equal(sources.includes("SUBCONTRACT_CERTIFICATION"), true);
  assert.equal(sources.includes("CERTIFICATION"), false);
});

test("VIEWER gets no pending sources", () => {
  const sources = fieldPendingSourcesForActor(["VIEWER"], allOn);
  assert.deepEqual(sources, []);
});

test("disabled PROCUREMENT module omits purchase orders even for OWNER", () => {
  const gate = createTenantModuleGate(new Map([["PROCUREMENT", false]]));
  assert.equal(fieldPendingSourceAllowed(["OWNER"], gate, "PURCHASE_ORDER"), false);
  assert.equal(can(["OWNER"], "APPROVE", "PURCHASE_ORDERS"), true);
});

test("parseFieldPendingGroup accepts canonical ids only", () => {
  assert.equal(parseFieldPendingGroup("compras"), "compras");
  assert.equal(parseFieldPendingGroup("obra"), "obra");
  assert.equal(parseFieldPendingGroup("certificaciones"), "certificaciones");
  assert.equal(parseFieldPendingGroup("all"), undefined);
  assert.equal(parseFieldPendingGroup(undefined), undefined);
});

test("resolveFieldPendingProjectFilter does not silently drop a bad id", () => {
  assert.equal(resolveFieldPendingProjectFilter(undefined), undefined);
  assert.equal(resolveFieldPendingProjectFilter(""), undefined);
  assert.equal(
    resolveFieldPendingProjectFilter("00000000-0000-4000-8000-000000000010"),
    "00000000-0000-4000-8000-000000000010",
  );
  assert.throws(
    () => resolveFieldPendingProjectFilter("not-a-uuid"),
    (err: unknown) => err instanceof ServiceError && err.code === "VALIDATION",
  );
});
