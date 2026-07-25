import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARGENTINE_COA_TEMPLATE_ACCOUNTS,
  ARGENTINE_COA_TEMPLATE_RULES,
} from "./accounting-coa-template.service";

describe("ARGENTINE_COA_TEMPLATE", () => {
  it("has at least 40 unique account codes", () => {
    assert.ok(ARGENTINE_COA_TEMPLATE_ACCOUNTS.length >= 40);
    const codes = ARGENTINE_COA_TEMPLATE_ACCOUNTS.map((a) => a.code);
    assert.equal(new Set(codes).size, codes.length, "duplicate account codes in template");
  });

  it("covers core operational mapping accounts", () => {
    const codes = new Set(ARGENTINE_COA_TEMPLATE_ACCOUNTS.map((a) => a.code));
    for (const required of [
      "1.1.01",
      "1.1.02",
      "1.1.10",
      "2.1.01",
      "4.1.01",
      "5.1.01",
      "1.1.05",
      "2.1.05",
      "3.2.10",
      "5.1.70",
    ]) {
      assert.ok(codes.has(required), `missing ${required}`);
    }
  });

  it("has unique eventTypes and only references template account codes", () => {
    const codes = new Set(ARGENTINE_COA_TEMPLATE_ACCOUNTS.map((a) => a.code));
    const events = ARGENTINE_COA_TEMPLATE_RULES.map((r) => r.eventType);
    assert.equal(new Set(events).size, events.length, "duplicate rule eventType");
    assert.ok(ARGENTINE_COA_TEMPLATE_RULES.length >= 8);
    for (const rule of ARGENTINE_COA_TEMPLATE_RULES) {
      assert.ok(codes.has(rule.debitCode), `rule ${rule.eventType} missing debit ${rule.debitCode}`);
      assert.ok(
        codes.has(rule.creditCode),
        `rule ${rule.eventType} missing credit ${rule.creditCode}`,
      );
      assert.notEqual(rule.debitCode, rule.creditCode, `rule ${rule.eventType} same debit/credit`);
    }
  });
});
