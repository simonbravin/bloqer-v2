import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { exportTreasuryMovementsCsv } from "../report-exports/report-export.service";
import type { ServiceContext } from "../types";
import { getAccountMovementReport, getCashFlowReport, getCashPositionReport } from "./treasury-reports.service";

const accountId = "58b739f7-d0dc-496f-a889-40ce88d58821";
const ctx: ServiceContext = { actorUserId: "actor", tenantId: "tenant", companyId: null, roles: ["OWNER"] };

function stub<T, K extends keyof T>(t: TestContext, target: T, key: K, replacement: unknown) {
  const original = target[key];
  target[key] = replacement as T[K];
  t.after(() => { target[key] = original; });
}

function movement(id: string, movementDate: string, valueDate: string | null, amount: string, type = "INFLOW") {
  return {
    id,
    accountId,
    movementDate: new Date(movementDate),
    valueDate: valueDate ? new Date(valueDate) : null,
    createdAt: new Date(movementDate),
    amount: new Prisma.Decimal(amount),
    fxRate: null,
    amountArs: null,
    type,
    status: "CONFIRMED",
    currency: "ARS",
    sourceType: "MANUAL_ADJUSTMENT",
    sourceId: id,
    description: id,
    transferId: null,
    projectId: null,
    counterpartyContactId: null,
    externalInvoiceRef: null,
    account: { name: "Banco sintético" },
    counterparty: null,
  };
}

test("extract by value date orders the balance and keeps fallback accounting date", async (t) => {
  const a = movement("later-by-value", "2026-11-01", "2026-11-08", "5");
  const b = movement("fallback", "2026-11-04", null, "20");
  const c = movement("first-by-value", "2026-11-06", "2026-11-03", "10", "OUTFLOW");
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.treasuryAccount, "findFirst", async () => ({ id: accountId }));
  stub(t, prisma.treasuryAccount, "findUnique", async () => ({ tenantId: ctx.tenantId, openingBalance: new Prisma.Decimal(100) }));
  stub(t, prisma.accountMovement, "findFirst", async () => null);
  stub(t, prisma.accountMovement, "findMany", async (query: { include?: unknown }) => query.include ? [a, b, c] : []);

  const report = await getAccountMovementReport({ accountId, dateBasis: "value", sortDir: "desc" }, ctx);
  assert.deepEqual(report.rows.map(({ id, valueDate, runningBalance }) => [id, valueDate, runningBalance]), [
    [a.id, "2026-11-08", "115.00"], [b.id, null, "110.00"], [c.id, "2026-11-03", "90.00"],
  ]);
});

test("movement CSV does not silently truncate at the interactive 100-row page size", async (t) => {
  const data = Array.from({ length: 124 }, (_, index) => movement(`movement-${index}`, "2026-11-05", null, "1"));
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.accountMovement, "findMany", async (query: { take?: number }) => data.slice(0, query.take));
  stub(t, prisma.accountMovement, "count", async () => data.length);

  const csv = await exportTreasuryMovementsCsv({ dateFrom: "2026-11-01", dateTo: "2026-11-30" }, ctx);
  assert.match(csv.content, /FechaContable.*FechaValor.*CriterioFecha/);
  assert.match(csv.content, /movement-123/);
  assert.equal(csv.content.trimEnd().split(/\r?\n/).length, 125);
});

test("cash position excludes foreign-company relations and combines legacy ARS spellings", async (t) => {
  const account = (id: string, currency: string, balance: number, companyTenant?: string) => ({
    id, name: id, currency, tenantId: ctx.tenantId, type: "BANK", status: "ACTIVE",
    openingBalance: new Prisma.Decimal(balance),
    companyId: companyTenant ? `company-${companyTenant}` : null,
    company: companyTenant ? { tenantId: companyTenant, name: companyTenant } : null,
  });
  const fixtures = [
    account("owned", " ars ", 10, ctx.tenantId),
    account("shared", "ARS", 20),
    account("foreign-company", "ARS", 1000, "other-tenant"),
    account("different-currency", "USD", 5),
  ];
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.treasuryAccount, "findMany", async (query: { where: Prisma.TreasuryAccountWhereInput }) => {
    assert.deepEqual(query.where, {
      tenantId: ctx.tenantId,
      OR: [{ companyId: null }, { company: { tenantId: ctx.tenantId } }],
    });
    return fixtures.filter((row) => row.companyId === null || row.company?.tenantId === query.where.tenantId);
  });
  stub(t, prisma.accountMovement, "groupBy", async (query: { where: { accountId: { in: string[] } } }) => {
    assert.deepEqual(query.where.accountId.in, ["owned", "shared"]);
    return [];
  });

  const position = await getCashPositionReport({ currency: " ars " }, ctx);
  assert.deepEqual(position.accounts.map(({ accountId, currency }) => [accountId, currency]), [["owned", "ARS"], ["shared", "ARS"]]);
  assert.deepEqual(position.byCurrency, [{ currency: "ARS", totalBalance: "30.00" }]);
  assert.equal(position.consolidatedArs, "30.00");
});

test("cash flow and extracts share the valid company scope, and legacy ARS amounts stay nominal", async (t) => {
  const accountScope = {
    tenantId: ctx.tenantId,
    OR: [{ companyId: null }, { company: { tenantId: ctx.tenantId } }],
  };
  const validAccountId = "valid-account";
  let movementReads = 0;
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.treasuryAccount, "findFirst", async (query: { where: Prisma.TreasuryAccountWhereInput }) => {
    assert.deepEqual(query.where, { ...accountScope, id: accountId });
    return null;
  });
  stub(t, prisma.accountMovement, "findMany", async (query: { where: Prisma.AccountMovementWhereInput; include?: unknown }) => {
    movementReads += 1;
    if (query.where.accountId === validAccountId) return []; // Opening balance before the period.
    assert.deepEqual(query.where.account, accountScope);
    if (!query.include) assert.deepEqual(query.where.accountId, { in: [validAccountId] });
    return [{ ...movement("legacy-ars", "2026-11-05", null, "10.25"), accountId: validAccountId, currency: " ars " }];
  });
  stub(t, prisma.treasuryAccount, "findMany", async (query: { where: Prisma.TreasuryAccountWhereInput }) => {
    assert.deepEqual(query.where, accountScope);
    return [{ id: validAccountId, currency: "ARS" }];
  });
  stub(t, prisma.treasuryAccount, "findUnique", async () => ({ tenantId: ctx.tenantId, openingBalance: new Prisma.Decimal(5) }));
  stub(t, prisma.accountMovement, "findFirst", async () => null);

  await assert.rejects(getAccountMovementReport({ accountId }, ctx), { code: "FORBIDDEN" });
  assert.equal(movementReads, 0);
  const extract = await getAccountMovementReport({}, ctx);
  assert.deepEqual(extract.rows.map(({ currency, fxRate, amountArs }) => [currency, fxRate, amountArs]), [["ARS", null, "10.25"]]);
  const flow = await getCashFlowReport({ dateFrom: "2026-11-01", dateTo: "2026-11-30", currency: "ARS" }, ctx);
  assert.equal(flow.length, 1);
  assert.equal(flow[0]?.openingBalance, "5.00");
  assert.equal(flow[0]?.closingBalance, "15.25");
});
