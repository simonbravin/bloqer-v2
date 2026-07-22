import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServiceContext } from "./types";
import { companyScopeFilter, companyScopeRelationFilter, isCrossCompany } from "./company-scope";

function ctxWith(companyId: string | null): ServiceContext {
  return {
    actorUserId: "user-1",
    tenantId: "tenant-1",
    companyId,
    roles: [],
  };
}

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

describe("companyScopeFilter", () => {
  it("returns empty filter for global membership (companyId null)", () => {
    assert.deepEqual(companyScopeFilter(ctxWith(null)), {});
  });

  it("includes own company AND shared rows (companyId null) when anchored", () => {
    assert.deepEqual(companyScopeFilter(ctxWith(COMPANY_A)), {
      OR: [{ companyId: COMPANY_A }, { companyId: null }],
    });
  });
});

describe("companyScopeRelationFilter", () => {
  it("returns empty filter for global membership", () => {
    assert.deepEqual(companyScopeRelationFilter("project", ctxWith(null)), {});
  });

  it("nests the OR scope under the relation when anchored", () => {
    assert.deepEqual(companyScopeRelationFilter("project", ctxWith(COMPANY_A)), {
      project: { OR: [{ companyId: COMPANY_A }, { companyId: null }] },
    });
  });
});

describe("isCrossCompany", () => {
  it("is false for a global membership regardless of the record", () => {
    assert.equal(isCrossCompany(COMPANY_B, ctxWith(null)), false);
    assert.equal(isCrossCompany(null, ctxWith(null)), false);
  });

  it("treats shared/corporate records (companyId null) as accessible", () => {
    // Regression: corporate treasury accounts (companyId null) must not be blocked
    // for a company-anchored user. See TENANT_COMPANY_SCOPING.md.
    assert.equal(isCrossCompany(null, ctxWith(COMPANY_A)), false);
  });

  it("allows the record of the active company", () => {
    assert.equal(isCrossCompany(COMPANY_A, ctxWith(COMPANY_A)), false);
  });

  it("blocks a record that belongs to another company", () => {
    assert.equal(isCrossCompany(COMPANY_B, ctxWith(COMPANY_A)), true);
  });
});
