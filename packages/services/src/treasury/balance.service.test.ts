import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { getAccountBalancesForAccounts, resolveOpeningBase } from "./balance.service";

test("resolveOpeningBase uses field when no OPENING_BALANCE movement", () => {
  assert.equal(resolveOpeningBase(new Prisma.Decimal(100), false).toString(), "100");
});

test("resolveOpeningBase zeroes field when OPENING_BALANCE movement exists", () => {
  assert.equal(resolveOpeningBase(new Prisma.Decimal(100), true).toString(), "0");
});

test("account balance needs only two grouped queries for 200 accounts and preserves opening and value-date semantics", async (t) => {
  const accounts = Array.from({ length: 200 }, (_, index) => ({
    id: `account-${index}`,
    openingBalance: new Prisma.Decimal(index === 0 ? "-100.1234" : "200"),
  }));
  const accountId = { in: accounts.map(({ id }) => id) };
  const beforeDate = new Date("2026-11-01T00:00:00.000Z");
  const group = (index: number, type: string, amount: string) => ({
    accountId: `account-${index}`, type, _sum: { amount: new Prisma.Decimal(amount) },
  });
  const groupBy = t.mock.fn(async (query: { by: string[]; where: unknown }) => {
    if (query.by.length === 1) {
      assert.deepEqual(query.where, { tenantId: "test-tenant", accountId, sourceType: "OPENING_BALANCE" });
      return [{ accountId: "account-0" }, { accountId: "account-2" }];
    }
    assert.deepEqual(query.by, ["accountId", "type"]);
    assert.deepEqual(query.where, {
      tenantId: "test-tenant", accountId, status: { in: ["CONFIRMED", "RECONCILED"] },
      OR: [{ valueDate: { lt: beforeDate } }, { valueDate: null, movementDate: { lt: beforeDate } }],
    });
    return [group(0, "OUTFLOW", "100.1234"), group(0, "TRANSFER_IN", "30.4321"), group(1, "ADJUSTMENT", "10.0021")];
  });

  const db = { accountMovement: { groupBy } } as unknown as NonNullable<Parameters<typeof getAccountBalancesForAccounts>[3]>;
  const balances = await getAccountBalancesForAccounts(accounts, "test-tenant", { beforeDate, dateBasis: "value" }, db);
  assert.equal(balances.size, 200);
  assert.equal(balances.get("account-0")?.toFixed(4), "-69.6913");
  assert.equal(balances.get("account-1")?.toFixed(4), "189.9979");
  assert.equal(balances.get("account-2")?.toFixed(4), "0.0000");
  assert.equal(balances.get("account-199")?.toFixed(4), "200.0000");
  assert.equal((await getAccountBalancesForAccounts([], "test-tenant", undefined, db)).size, 0);
  assert.equal(groupBy.mock.callCount(), 2);
});
