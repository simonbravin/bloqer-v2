import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasTenantWideProjectAccess,
  projectIdWhereForScope,
  projectRowIdWhereForScope,
  type ProjectAccessScope,
} from "./access";

/**
 * Side-channel invariant: aggregates must apply scope BEFORE sum/count,
 * never sum tenant-wide then filter in memory.
 */
function aggregateOpenPayables(
  rows: Array<{ projectId: string; balance: number }>,
  scope: ProjectAccessScope,
): number {
  const where = projectIdWhereForScope(scope);
  if (scope === "ALL") {
    return rows.reduce((s, r) => s + r.balance, 0);
  }
  const allowed = new Set((where as { projectId: { in: string[] } }).projectId.in);
  return rows.filter((r) => allowed.has(r.projectId)).reduce((s, r) => s + r.balance, 0);
}

describe("D-111 aggregate scope (side-channel)", () => {
  const rows = [
    { projectId: "A1", balance: 10_000_000 },
    { projectId: "A2", balance: 90_000_000 },
  ];

  it("MEMBERSHIP_SCOPED user with only A1 cannot infer A2 totals", () => {
    const total = aggregateOpenPayables(rows, { projectIds: ["A1"] });
    assert.equal(total, 10_000_000);
    assert.notEqual(total, 100_000_000);
  });

  it("empty membership matches nothing (never omit filter)", () => {
    const where = projectIdWhereForScope({ projectIds: [] });
    assert.deepEqual(where, { projectId: { in: [] } });
    assert.equal(aggregateOpenPayables(rows, { projectIds: [] }), 0);
  });

  it("TENANT_WIDE / ALL leaves no projectId filter", () => {
    assert.deepEqual(projectIdWhereForScope("ALL"), {});
    assert.deepEqual(projectRowIdWhereForScope("ALL"), {});
    assert.equal(aggregateOpenPayables(rows, "ALL"), 100_000_000);
  });

  it("project row id filter uses id IN for listProjects/dashboard", () => {
    assert.deepEqual(projectRowIdWhereForScope({ projectIds: ["A1"] }), {
      id: { in: ["A1"] },
    });
  });
});

describe("D-111 TENANT_WIDE regression helpers", () => {
  it("OWNER keeps tenant-wide bypass under SCOPED design", () => {
    assert.equal(hasTenantWideProjectAccess(["OWNER"]), true);
  });

  it("PROJECT_MANAGER does not get tenant-wide bypass", () => {
    assert.equal(hasTenantWideProjectAccess(["PROJECT_MANAGER"]), false);
  });
});
