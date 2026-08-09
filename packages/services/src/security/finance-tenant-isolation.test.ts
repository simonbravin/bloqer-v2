import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertResourceTenant,
  filterRowsForTenant,
  FINANCE_ISOLATION_SCENARIOS,
  type FinanceIsolationScenario,
} from "./tenant-isolation";
import { ServiceError } from "../types";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

function expectForbidden(fn: () => void): void {
  assert.throws(fn, (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN");
}

describe("finance tenant isolation contract (Phase 5)", () => {
  it("covers the critical finance scenarios required for MVP", () => {
    const required: FinanceIsolationScenario[] = [
      "ar_collection",
      "ap_payment",
      "internal_transfer",
      "period_close",
      "treasury_adjustment",
      "receivable_read",
      "payable_read",
      "journal_entry",
    ];
    for (const scenario of required) {
      assert.ok(FINANCE_ISOLATION_SCENARIOS.includes(scenario), scenario);
    }
    assert.equal(FINANCE_ISOLATION_SCENARIOS.length, 8);
  });

  it("ar_collection: foreign receivable is FORBIDDEN", () => {
    expectForbidden(() => assertResourceTenant(TENANT_B, TENANT_A));
  });

  it("ap_payment: foreign payable is FORBIDDEN", () => {
    expectForbidden(() => assertResourceTenant(TENANT_B, TENANT_A));
  });

  it("internal_transfer: foreign treasury account is FORBIDDEN", () => {
    expectForbidden(() => assertResourceTenant(TENANT_B, TENANT_A));
  });

  it("period_close: foreign company period is FORBIDDEN", () => {
    expectForbidden(() => assertResourceTenant(TENANT_B, TENANT_A));
  });

  it("treasury_adjustment: foreign account is FORBIDDEN", () => {
    expectForbidden(() => assertResourceTenant(TENANT_B, TENANT_A));
  });

  it("receivable_read: list never leaks foreign tenant rows", () => {
    const rows = [
      { id: "r1", tenantId: TENANT_A },
      { id: "r2", tenantId: TENANT_B },
    ];
    assert.deepEqual(
      filterRowsForTenant(rows, TENANT_A).map((r) => r.id),
      ["r1"],
    );
  });

  it("payable_read: empty when only foreign rows exist", () => {
    const rows = [{ id: "p1", tenantId: TENANT_B }];
    assert.deepEqual(filterRowsForTenant(rows, TENANT_A), []);
  });

  it("same-tenant resource is allowed", () => {
    assert.doesNotThrow(() => assertResourceTenant(TENANT_A, TENANT_A));
  });

  it("missing resource tenantId is FORBIDDEN (no null bypass)", () => {
    expectForbidden(() => assertResourceTenant(null, TENANT_A));
    expectForbidden(() => assertResourceTenant(undefined, TENANT_A));
  });
});
