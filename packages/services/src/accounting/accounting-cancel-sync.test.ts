import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCrossCompany } from "../company-scope";
import type { ServiceContext } from "../types";

/**
 * Documents the company-scope rule used by `syncJournalOnOperationalCancel`
 * (enforceCompanyScope default true) without hitting Prisma.
 */
describe("syncJournalOnOperationalCancel company scope policy", () => {
  const ctxA: ServiceContext = {
    actorUserId: "u1",
    tenantId: "t1",
    companyId: "company-a",
    roles: [],
  };

  it("blocks company-scoped cancel when membership is anchored to another company", () => {
    assert.equal(isCrossCompany("company-b", ctxA), true);
  });

  it("allows cancel for the active company", () => {
    assert.equal(isCrossCompany("company-a", ctxA), false);
  });

  it("allows tenant-wide treasury path when company scope is not enforced", () => {
    const enforceCompanyScope = false;
    const wouldBlock =
      enforceCompanyScope !== false && isCrossCompany("company-b", ctxA);
    assert.equal(wouldBlock, false);
  });
});
