import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canViewCompanyAp } from "../ap/ap-access";
import { canViewCompanyAr } from "../ar/ar-access";
import { canViewCompanyFinanceHub, canViewCompanyTreasury } from "../finance/finance-access";

describe("D-056 company finance helpers", () => {
  it("blocks operative combo from company hub/treasury/aging company", () => {
    const roles = ["PROCUREMENT", "WAREHOUSE", "SALES", "PROJECT_MANAGER"] as const;
    assert.equal(canViewCompanyFinanceHub([...roles]), false);
    assert.equal(canViewCompanyTreasury([...roles]), false);
    assert.equal(canViewCompanyAr([...roles]), false);
    assert.equal(canViewCompanyAp([...roles]), false);
  });

  it("allows FINANCE company hub and treasury", () => {
    assert.equal(canViewCompanyFinanceHub(["FINANCE"]), true);
    assert.equal(canViewCompanyTreasury(["FINANCE"]), true);
    assert.equal(canViewCompanyAr(["FINANCE"]), true);
    assert.equal(canViewCompanyAp(["FINANCE"]), true);
  });

  it("allows VIEWER read company finance", () => {
    assert.equal(canViewCompanyFinanceHub(["VIEWER"]), true);
    assert.equal(canViewCompanyTreasury(["VIEWER"]), true);
  });

  it("PROJECT_FINANCE cannot open company hub", () => {
    assert.equal(canViewCompanyFinanceHub(["PROJECT_FINANCE"]), false);
    assert.equal(canViewCompanyAr(["PROJECT_FINANCE"]), false);
    assert.equal(canViewCompanyAp(["PROJECT_FINANCE"]), false);
  });
});
