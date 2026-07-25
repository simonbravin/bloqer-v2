import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import {
  assertSourcedLineMoneyUnchanged,
  isSourcedJournalEntry,
  type ParsedJournalLine,
} from "./journal-entry.service";

function line(partial: {
  accountId?: string;
  projectId?: string | null;
  description?: string | null;
  debit: string;
  credit: string;
  currency: string;
}): ParsedJournalLine {
  return {
    accountId: partial.accountId ?? "acc",
    projectId: partial.projectId ?? null,
    description: partial.description ?? null,
    debit: new Prisma.Decimal(partial.debit),
    credit: new Prisma.Decimal(partial.credit),
    currency: partial.currency,
  };
}

describe("isSourcedJournalEntry", () => {
  it("treats MANUAL as not sourced", () => {
    assert.equal(isSourcedJournalEntry({ sourceType: "MANUAL", sourceId: null }), false);
    assert.equal(isSourcedJournalEntry({ sourceType: "MANUAL", sourceId: "x" }), false);
  });

  it("treats operational sources with sourceId as sourced", () => {
    assert.equal(isSourcedJournalEntry({ sourceType: "COLLECTION", sourceId: "c1" }), true);
    assert.equal(isSourcedJournalEntry({ sourceType: "PAYMENT", sourceId: null }), false);
  });
});

describe("assertSourcedLineMoneyUnchanged", () => {
  const existing = [
    { debit: new Prisma.Decimal("100.00"), credit: new Prisma.Decimal("0"), currency: "ARS" },
    { debit: new Prisma.Decimal("0"), credit: new Prisma.Decimal("100.00"), currency: "ARS" },
  ];

  it("allows account/description changes with same money", () => {
    assert.doesNotThrow(() =>
      assertSourcedLineMoneyUnchanged(existing, [
        line({ accountId: "a2", description: "x", debit: "100", credit: "0", currency: "ARS" }),
        line({ accountId: "b2", debit: "0", credit: "100.00", currency: "ARS" }),
      ]),
    );
  });

  it("rejects amount changes", () => {
    assert.throws(
      () =>
        assertSourcedLineMoneyUnchanged(existing, [
          line({ debit: "90", credit: "0", currency: "ARS" }),
          line({ debit: "0", credit: "90", currency: "ARS" }),
        ]),
      (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION",
    );
  });

  it("rejects currency changes", () => {
    assert.throws(
      () =>
        assertSourcedLineMoneyUnchanged(existing, [
          line({ debit: "100", credit: "0", currency: "USD" }),
          line({ debit: "0", credit: "100", currency: "USD" }),
        ]),
      (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION",
    );
  });

  it("rejects structure changes", () => {
    assert.throws(
      () =>
        assertSourcedLineMoneyUnchanged(existing, [
          line({ debit: "100", credit: "0", currency: "ARS" }),
        ]),
      (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION",
    );
  });
});
