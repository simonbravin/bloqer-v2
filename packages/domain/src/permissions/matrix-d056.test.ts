import assert from "node:assert/strict";
import { test } from "node:test";
import { can } from "./matrix";
import { hasCompanyFinanceRole } from "./roles";

test("D-056: operative roles lose company TREASURY and ACCOUNTING", () => {
  const combo: ("PROCUREMENT" | "WAREHOUSE" | "SALES" | "PROJECT_MANAGER")[] = [
    "PROCUREMENT",
    "WAREHOUSE",
    "SALES",
    "PROJECT_MANAGER",
  ];
  assert.equal(can(combo, "VIEW", "TREASURY"), false);
  assert.equal(can(combo, "VIEW", "ACCOUNTING"), false);
  assert.equal(can(combo, "VIEW", "BANK_ACCOUNTS"), false);
  assert.equal(can(combo, "VIEW", "AR"), true);
  assert.equal(can(combo, "VIEW", "AP"), true);
  assert.equal(hasCompanyFinanceRole(combo), false);
});

test("D-056: FINANCE keeps company treasury and GL", () => {
  assert.equal(can(["FINANCE"], "VIEW", "TREASURY"), true);
  assert.equal(can(["FINANCE"], "VIEW", "BANK_ACCOUNTS"), true);
  assert.equal(can(["FINANCE"], "VIEW", "ACCOUNTING"), true);
  assert.equal(can(["FINANCE"], "APPROVE", "ACCOUNTING"), true);
  assert.equal(hasCompanyFinanceRole(["FINANCE"]), true);
});

test("D-056: TREASURER has company cash without GL approve", () => {
  assert.equal(can(["TREASURER"], "APPROVE", "TREASURY"), true);
  assert.equal(can(["TREASURER"], "APPROVE", "BANK_ACCOUNTS"), true);
  assert.equal(can(["TREASURER"], "EDIT", "AR"), true);
  assert.equal(can(["TREASURER"], "EDIT", "AP"), true);
  assert.equal(can(["TREASURER"], "VIEW", "ACCOUNTING"), true);
  assert.equal(can(["TREASURER"], "EDIT", "ACCOUNTING"), false);
  assert.equal(can(["TREASURER"], "APPROVE", "ACCOUNTING"), false);
  assert.equal(can(["TREASURER"], "APPROVE", "TAXES"), false);
  assert.equal(hasCompanyFinanceRole(["TREASURER"]), true);
});

test("D-056: PROJECT_FINANCE has project AR/AP without treasury", () => {
  assert.equal(can(["PROJECT_FINANCE"], "EDIT", "AR"), true);
  assert.equal(can(["PROJECT_FINANCE"], "VIEW", "AP"), true);
  assert.equal(can(["PROJECT_FINANCE"], "VIEW", "TREASURY"), false);
  assert.equal(can(["PROJECT_FINANCE"], "VIEW", "ACCOUNTING"), false);
  assert.equal(hasCompanyFinanceRole(["PROJECT_FINANCE"]), false);
});
