import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertTenantModuleEnabledWithGate,
  createTenantModuleGate,
  resolveTenantModuleEnabled,
} from "./tenant-module.service";
import { ServiceError } from "../types";

test("resolveTenantModuleEnabled defaults missing row to enabled (default-on)", () => {
  const byKey = new Map<string, boolean>();
  assert.equal(resolveTenantModuleEnabled(byKey, "BUDGETS"), true);
});

test("resolveTenantModuleEnabled respects explicit false", () => {
  const byKey = new Map<string, boolean>([["BUDGETS", false]]);
  assert.equal(resolveTenantModuleEnabled(byKey, "BUDGETS"), false);
});

test("resolveTenantModuleEnabled respects explicit true", () => {
  const byKey = new Map<string, boolean>([["BUDGETS", true]]);
  assert.equal(resolveTenantModuleEnabled(byKey, "BUDGETS"), true);
});

test("assertTenantModuleEnabledWithGate throws FORBIDDEN when module disabled", () => {
  const gate = createTenantModuleGate(new Map([["PROCUREMENT", false]]));
  assert.throws(
    () => assertTenantModuleEnabledWithGate(gate, "PROCUREMENT"),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, "FORBIDDEN");
      return true;
    },
  );
});

test("assertTenantModuleEnabledWithGate allows default-on missing key", () => {
  const gate = createTenantModuleGate(new Map());
  assert.doesNotThrow(() => assertTenantModuleEnabledWithGate(gate, "CERTIFICATIONS"));
});

test("assertTenantModuleEnabledWithGate allows explicit enabled", () => {
  const gate = createTenantModuleGate(new Map([["SCHEDULE", true]]));
  assert.doesNotThrow(() => assertTenantModuleEnabledWithGate(gate, "SCHEDULE"));
});
