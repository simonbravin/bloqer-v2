import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canEditCompanyAp, canMutateApForScope, canViewCompanyAp } from "../ap/ap-access";
import { canMutateArForScope, canViewCompanyAr } from "../ar/ar-access";
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

  it("allows TREASURER company hub and treasury", () => {
    assert.equal(canViewCompanyFinanceHub(["TREASURER"]), true);
    assert.equal(canViewCompanyTreasury(["TREASURER"]), true);
    assert.equal(canViewCompanyAr(["TREASURER"]), true);
    assert.equal(canViewCompanyAp(["TREASURER"]), true);
  });

  it("blocks PROCUREMENT from company AP edit helper", () => {
    assert.equal(canEditCompanyAp(["PROCUREMENT"]), false);
    assert.equal(canMutateApForScope(["PROCUREMENT"], null), false);
    assert.equal(canMutateApForScope(["PROCUREMENT"], "proj-1"), true);
  });

  it("blocks SALES from company AR mutate on corporate scope", () => {
    assert.equal(canMutateArForScope(["SALES"], null), false);
    assert.equal(canMutateArForScope(["SALES"], "proj-1"), true);
    assert.equal(canMutateArForScope(["TREASURER"], null), true);
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
