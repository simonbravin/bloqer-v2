import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { suggestTreasuryGlAccountCode } from "./treasury-gl-account-hint";

/**
 * Documents suggestJournalFromCollection/Payment parity with auto-draft:
 * treasury GL code override wins over mapping rule account when present.
 */
type TreasuryHintAccount = Parameters<typeof suggestTreasuryGlAccountCode>[0];

function resolveDebitForCollection(params: {
  ruleDebitAccountId: string;
  account: TreasuryHintAccount;
  glAccountIdByCode: Record<string, string | null>;
}): { debitAccountId: string; usedOverride: boolean } {
  const code = suggestTreasuryGlAccountCode(params.account);
  const override = params.glAccountIdByCode[code] ?? null;
  return {
    debitAccountId: override ?? params.ruleDebitAccountId,
    usedOverride: override != null,
  };
}

function resolveCreditForPayment(params: {
  ruleCreditAccountId: string;
  account: TreasuryHintAccount;
  glAccountIdByCode: Record<string, string | null>;
}): { creditAccountId: string; usedOverride: boolean } {
  const code = suggestTreasuryGlAccountCode(params.account);
  const override = params.glAccountIdByCode[code] ?? null;
  return {
    creditAccountId: override ?? params.ruleCreditAccountId,
    usedOverride: override != null,
  };
}

describe("suggestion GL override parity (collection/payment)", () => {
  test("collection uses treasury GL debit override when active account exists", () => {
    const result = resolveDebitForCollection({
      ruleDebitAccountId: "rule-debit",
      account: { type: "BANK", currency: "ARS" },
      glAccountIdByCode: { "1.1.02": "gl-bank-ars" },
    });
    assert.equal(result.usedOverride, true);
    assert.equal(result.debitAccountId, "gl-bank-ars");
  });

  test("collection falls back to mapping rule when GL code missing", () => {
    const result = resolveDebitForCollection({
      ruleDebitAccountId: "rule-debit",
      account: { type: "BANK", currency: "ARS" },
      glAccountIdByCode: { "1.1.02": null },
    });
    assert.equal(result.usedOverride, false);
    assert.equal(result.debitAccountId, "rule-debit");
  });

  test("payment uses treasury GL credit override when active account exists", () => {
    const result = resolveCreditForPayment({
      ruleCreditAccountId: "rule-credit",
      account: { type: "CASH", currency: "ARS" },
      glAccountIdByCode: { "1.1.01": "gl-cash" },
    });
    assert.equal(result.usedOverride, true);
    assert.equal(result.creditAccountId, "gl-cash");
  });
});
