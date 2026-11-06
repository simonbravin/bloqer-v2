/** AG-10 treasury regression. All SQL writes require the verified isolated fixture database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import { after, before, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { createTreasuryAccountSchema } from "@bloqer/validators";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { closeFinancialPeriod, reopenFinancialPeriod } from "../finance/period-lock.service";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { cancelAccountMovement, getAccountMovementById } from "./account-movement.service";
import {
  addBankStatementLine, cancelBankReconciliation, closeBankReconciliation, createBankReconciliation,
  createMovementFromStatementLine, getBankReconciliationById, matchBankReconciliationLine,
  importBankStatementLinesFromCsv, importBankStatementLinesFromOfx,
  listCandidateMovementsForReconciliation, removeBankStatementLine, reopenBankReconciliation, unmatchBankReconciliationLine,
} from "./bank-reconciliation.service";
import { getAccountBalance, getAccountBalanceAsOf, getTreasurySummaryByTenant } from "./balance.service";
import { cancelInternalTransfer, createInternalTransfer, getInternalTransferById } from "./internal-transfer.service";
import { registerCorporateTreasuryInflow } from "./register-corporate-treasury-inflow.service";
import { registerManualTreasuryAdjustment } from "./register-manual-treasury-adjustment.service";
import {
  closeTreasuryAccount, createTreasuryAccount, deactivateTreasuryAccount, listTreasuryAccounts,
  reactivateTreasuryAccount, updateTreasuryAccount,
} from "./treasury-account.service";
import { getTreasuryHubOverview } from "./treasury-hub.service";

const validation = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION";
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const denied = (error: unknown) => error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code);
const closedPeriod = (error: unknown) => conflict(error) && (error as Error).message.includes("PERIOD_CLOSED");

describe("AG-10 treasury and reconciliation on isolated SQL", { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false }, () => {
  const tenantId = randomUUID();
  const foreignTenantId = randomUUID();
  const companyId = randomUUID();
  const secondCompanyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const actorUserId = randomUUID();
  const actorEmail = `audit-treasury-${actorUserId}@example.test`;
  const ctx: ServiceContext = { tenantId, companyId, actorUserId, roles: ["OWNER"] };
  const second: ServiceContext = { ...ctx, companyId: secondCompanyId };
  const global: ServiceContext = { ...ctx, companyId: null };
  const retain = process.env.BLOQER_AUDIT_RETAIN_FIXTURES === "1";
  const today = toIsoDateInTimeZone();
  const arsAccountId = randomUUID();
  const usdAccountId = randomUUID();
  const usdDestinationId = randomUUID();
  const secondAccountId = randomUUID();
  const foreignAccountId = randomUUID();
  let verified = false;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    const passwordHash = retain ? await hash("audit-ag10-local-only", 10) : null;
    await prisma.$transaction(async tx => {
      await tx.tenant.createMany({
        data: [tenantId, foreignTenantId].map(id => ({ id, name: "Tesorería de prueba AG-10", slug: `audit-treasury-${id}` })),
      });
      await tx.company.createMany({ data: [
        { id: companyId, tenantId, name: "Empresa de prueba A" },
        { id: secondCompanyId, tenantId, name: "Empresa de prueba B" },
        { id: foreignCompanyId, tenantId: foreignTenantId, name: "Empresa de otro tenant" },
      ] });
      await tx.user.create({ data: { id: actorUserId, email: actorEmail, passwordHash, status: "ACTIVE", emailVerified: new Date() } });
      await tx.userMembership.create({ data: { tenantId, companyId, userId: actorUserId, roles: ["OWNER"] } });
      await tx.tenantModuleSetting.create({ data: { tenantId, moduleKey: "ACCOUNTING", isEnabled: false } });
      await tx.treasuryAccount.createMany({ data: [
        { id: arsAccountId, tenantId, companyId: null, name: "Caja de prueba ARS", type: "CASH", currency: "ARS", openingBalance: "1000" },
        { id: usdAccountId, tenantId, companyId, name: "Banco de prueba USD", type: "BANK", currency: "USD", openingBalance: "100" },
        { id: usdDestinationId, tenantId, companyId, name: "Caja de prueba USD", type: "CASH", currency: "USD" },
        { id: secondAccountId, tenantId, companyId: secondCompanyId, name: "Banco de prueba B", type: "BANK", currency: "ARS" },
        { id: foreignAccountId, tenantId: foreignTenantId, companyId: foreignCompanyId, name: "Banco de otro tenant", type: "BANK", currency: "ARS" },
      ] });
    }, { timeout: 30_000 });
  });

  after(async () => {
    if (!verified) return;
    try {
      if (retain) {
        const path = fileURLToPath(new URL("../../../../output/platform-audit/ag-10-2026-11-05/treasury-retained-fixture.json", import.meta.url));
        await mkdir(dirname(path), { recursive: true });
        const accounts = await prisma.treasuryAccount.findMany({
          where: { tenantId },
          select: { id: true, name: true, currency: true, status: true },
        });
        const reconciliations = await prisma.bankReconciliation.findMany({
          where: { tenantId },
          select: { id: true, accountId: true, periodStart: true, periodEnd: true, status: true },
        });
        await writeFile(path, JSON.stringify({ actorEmail, tenantId, companyId, arsAccountId, usdAccountId, usdDestinationId, accounts, reconciliations }, null, 2) + "\n");
        return;
      }
      const tenants = { in: [tenantId, foreignTenantId] };
      await prisma.$transaction(async tx => {
        await tx.bankReconciliation.deleteMany({ where: { tenantId: tenants } });
        await tx.accountMovement.deleteMany({ where: { tenantId: tenants } });
        await tx.internalTransfer.deleteMany({ where: { tenantId: tenants } });
        await tx.journalEntry.deleteMany({ where: { tenantId: tenants } });
        await tx.period.deleteMany({ where: { tenantId: tenants } });
        await tx.treasuryAccount.deleteMany({ where: { tenantId: tenants } });
        await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
        await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
        await tx.company.deleteMany({ where: { tenantId: tenants } });
        await tx.tenant.deleteMany({ where: { id: tenants } });
        await tx.user.delete({ where: { id: actorUserId } });
      }, { timeout: 60_000 });
    } finally {
      await prisma.$disconnect();
    }
  });

  const movement = (id: string) => prisma.accountMovement.findUniqueOrThrow({ where: { id } });
  const adjustment = (accountId: string, movementDate = today) => ({
    accountId, movementDate, amount: "10.00", direction: "INFLOW" as const,
    description: "Ajuste sintético", idempotencyKey: randomUUID(),
  });
  const transferInput = (sourceAccountId: string, destinationAccountId: string, transferDate = today) => ({
    sourceAccountId, destinationAccountId, transferDate, valueDate: transferDate,
    amount: "10.00", idempotencyKey: randomUUID(),
    description: "Transferencia sintética",
  });

  it("blocks foreign company attachment, hides malformed foreign account links and keeps shared balances visible", async () => {
    const count = await prisma.treasuryAccount.count({ where: { tenantId } });
    await assert.rejects(() => createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: "Cuenta no permitida", type: "BANK", companyId: foreignCompanyId, openingBalance: "15",
    }), ctx), denied);
    assert.equal(await prisma.treasuryAccount.count({ where: { tenantId } }), count);
    await assert.rejects(() => getTreasurySummaryByTenant({ ...ctx, roles: ["VIEWER"] }), denied);
    const summary = await getTreasurySummaryByTenant(ctx);
    assert.ok(summary.some(row => row.accountId === arsAccountId));
    assert.ok(summary.some(row => row.accountId === secondAccountId));
    const invalidRoot = await prisma.accountMovement.create({
      data: {
        tenantId, companyId, accountId: foreignAccountId, movementDate: new Date(today), amount: "123",
        currency: "ARS", type: "INFLOW", sourceType: "MANUAL_ADJUSTMENT", description: "Relación ajena sintética",
      },
    });
    await assert.rejects(() => getAccountMovementById(invalidRoot.id, ctx), denied);
    assert.ok(!(await getTreasuryHubOverview(ctx)).recentMovements.some(row => row.id === invalidRoot.id));
  });

  it("keeps account terminal state and permits clearing optional details", async () => {
    const account = await createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: `Cuenta editable ${randomUUID()}`, type: "BANK", alias: "alias-inicial",
    }), ctx);
    assert.equal((await updateTreasuryAccount(account.id, { alias: null }, ctx)).alias, null);
    await prisma.treasuryAccount.update({ where: { id: account.id }, data: { status: "CLOSED" } });
    await assert.rejects(() => reactivateTreasuryAccount(account.id, ctx), conflict);
    assert.equal((await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: account.id } })).status, "CLOSED");
    assert.equal((await listTreasuryAccounts(ctx, { page: 999_999_999 })).data[0]?.id, (await listTreasuryAccounts(ctx, { page: 1 })).data[0]?.id);
  });

  it("closes an inactive zero account and serializes terminal closure with a competing inflow", async () => {
    await assert.rejects(() => closeTreasuryAccount(arsAccountId, ctx), conflict);
    const zero = await createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: `Cuenta sin saldo ${randomUUID()}`, type: "BANK",
    }), ctx);
    const credit = await registerManualTreasuryAdjustment(adjustment(zero.id), ctx);
    await registerManualTreasuryAdjustment({ ...adjustment(zero.id), direction: "OUTFLOW" }, ctx);
    await deactivateTreasuryAccount(zero.id, ctx);
    assert.equal((await closeTreasuryAccount(zero.id, ctx)).status, "CLOSED");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, action: "account.closed", entityId: zero.id } }), 1);
    await assert.rejects(() => reactivateTreasuryAccount(zero.id, ctx), conflict);
    await assert.rejects(() => cancelAccountMovement(credit.id, ctx), conflict);
    assert.equal((await getAccountBalance(zero.id)).toFixed(2), "0.00");

    const competing = await createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: `Cuenta con operaciones simultáneas ${randomUUID()}`, type: "BANK",
    }), ctx);
    const outcomes = await Promise.allSettled([
      closeTreasuryAccount(competing.id, ctx),
      registerManualTreasuryAdjustment(adjustment(competing.id), ctx),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.ok(outcomes.every(result => result.status === "fulfilled" || conflict(result.reason)));
    const current = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: competing.id } });
    assert.equal((await getAccountBalance(competing.id)).toFixed(2), current.status === "CLOSED" ? "0.00" : "10.00");
  });

  it("stores opening and manual FX, enforces calendar dates and rounded positive values, and rejects a modified replay", async () => {
    const input = createTreasuryAccountSchema.parse({
      name: `Apertura USD ${randomUUID()}`, type: "BANK", currency: "USD", openingBalance: "12.34",
    });
    await assert.rejects(() => createTreasuryAccount(input, ctx), validation);
    const account = await createTreasuryAccount({ ...input, openingFxRate: "1234.567891" }, ctx);
    assert.equal(account.balance, "12.34");
    const opening = await prisma.accountMovement.findFirstOrThrow({
      where: { tenantId, accountId: account.id, sourceType: "OPENING_BALANCE" },
    });
    assert.equal(opening.fxRate?.toFixed(6), "1234.567891");
    assert.equal(opening.amountArs?.toFixed(2), "15234.57");

    const op = adjustment(usdAccountId);
    await assert.rejects(() => registerManualTreasuryAdjustment(op, ctx), validation);
    await assert.rejects(() => registerManualTreasuryAdjustment({ ...op, movementDate: "2026-02-31", fxRate: "1250" }, ctx), validation);
    await assert.rejects(() => registerManualTreasuryAdjustment({ ...op, amount: "0.004", fxRate: "1250" }, ctx), validation);
    const saved = await registerManualTreasuryAdjustment({ ...op, amount: "10.005", fxRate: "1250.123456" }, ctx);
    const row = await movement(saved.id);
    assert.equal(row.amount.toFixed(2), "10.01");
    assert.equal(row.amountArs?.toFixed(2), "12513.74");
    assert.equal((await registerManualTreasuryAdjustment({ ...op, amount: "10.01", fxRate: "1250.123456" }, ctx)).id, row.id);
    await assert.rejects(() => registerManualTreasuryAdjustment({ ...op, amount: "10.01", fxRate: "1300" }, ctx), conflict);

    const corporate = { ...adjustment(arsAccountId), externalInvoiceRef: "PRUEBA-1" };
    const inflow = await registerCorporateTreasuryInflow(corporate, ctx);
    assert.equal((await movement(inflow.primaryEntityId)).fxRate?.toFixed(6), "1.000000");
    assert.equal((await movement(inflow.primaryEntityId)).amountArs?.toFixed(2), "10.00");
    await assert.rejects(() => registerCorporateTreasuryInflow(corporate, second), conflict);
  });

  it("records both USD transfer movements with the same snapshot and restores both balances once on cancellation", async () => {
    const op = transferInput(usdAccountId, usdDestinationId);
    await assert.rejects(() => createInternalTransfer(op, ctx), validation);
    const fromBefore = await getAccountBalance(usdAccountId);
    const toBefore = await getAccountBalance(usdDestinationId);
    const transfer = await createInternalTransfer({ ...op, fxRate: "1250.123456" }, ctx);
    const legs = await prisma.accountMovement.findMany({ where: { tenantId, sourceId: transfer.id }, orderBy: { type: "asc" } });
    assert.equal(legs.length, 2);
    assert.ok(legs.every(leg => leg.fxRate?.toFixed(6) === "1250.123456" && leg.amountArs?.toFixed(2) === "12501.23"));
    assert.equal((await getInternalTransferById(transfer.id, ctx)).fxRate, "1250.123456");
    assert.equal((await createInternalTransfer({ ...op, fxRate: "1250.123456" }, ctx)).id, transfer.id);
    await assert.rejects(() => createInternalTransfer({ ...op, fxRate: "1250.123456", description: "Distinta" }, ctx), conflict);
    await assert.rejects(() => createInternalTransfer({ ...op, fxRate: "1300" }, ctx), conflict);
    await assert.rejects(() => createInternalTransfer({ ...op, fxRate: "1250.123456", valueDate: "2089-12-15" }, ctx), conflict);
    assert.ok((await getAccountBalance(usdAccountId)).equals(fromBefore.minus(10)));
    assert.ok((await getAccountBalance(usdDestinationId)).equals(toBefore.plus(10)));
    await cancelInternalTransfer(transfer.id, ctx);
    assert.ok((await getAccountBalance(usdAccountId)).equals(fromBefore));
    assert.ok((await getAccountBalance(usdDestinationId)).equals(toBefore));
    await assert.rejects(() => cancelInternalTransfer(transfer.id, ctx), conflict);
    await assert.rejects(() => createInternalTransfer(transferInput(usdAccountId, arsAccountId), ctx), conflict);
  });

  it("D-136 stores negative opening once as an outflow with FX, rejects a closed month and writes no zero movement", async () => {
    const opening = createTreasuryAccountSchema.parse({
      name: `Apertura negativa USD ${randomUUID()}`, type: "BANK", currency: "USD", openingBalance: "-12.34",
    });
    await assert.rejects(() => createTreasuryAccount(opening, ctx), validation);
    await assert.rejects(() => createTreasuryAccount({ ...opening, openingFxRate: "1234.567891" }, global), validation);
    const period = { companyId, periodKey: today.slice(0, 7) };
    await closeFinancialPeriod(period, ctx);
    try {
      await assert.rejects(() => createTreasuryAccount({ ...opening, openingFxRate: "1234.567891" }, ctx), closedPeriod);
      assert.equal(await prisma.treasuryAccount.count({ where: { tenantId, name: opening.name } }), 0);
    } finally {
      await reopenFinancialPeriod({ ...period, reason: "Reapertura de prueba" }, ctx);
    }
    const negative = await createTreasuryAccount({ ...opening, openingFxRate: "1234.567891" }, ctx);
    assert.equal(negative.openingBalance, "-12.34");
    assert.equal(negative.balance, "-12.34");
    const legs = await prisma.accountMovement.findMany({ where: { tenantId, accountId: negative.id } });
    assert.equal(legs.length, 1);
    assert.equal(legs[0]?.sourceType, "OPENING_BALANCE");
    assert.equal(legs[0]?.type, "OUTFLOW");
    assert.equal(legs[0]?.amount.toFixed(2), "12.34");
    assert.equal(legs[0]?.fxRate?.toFixed(6), "1234.567891");
    assert.equal(legs[0]?.amountArs?.toFixed(2), "15234.57");
    assert.equal(await prisma.journalEntry.count({ where: { tenantId, sourceId: legs[0]?.id } }), 0);
    const zero = await createTreasuryAccount({ ...opening, name: `Apertura cero ${randomUUID()}`, openingBalance: "0" }, global);
    assert.equal(zero.balance, "0.00");
    assert.equal(await prisma.accountMovement.count({ where: { tenantId, accountId: zero.id } }), 0);
  });

  it("D-137 stores independent value dates, uses them for bank cuts and keeps period locks on the accounting date", async () => {
    const destination = await createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: `Fecha valor ${randomUUID()}`, type: "BANK",
    }), ctx);
    const legacyDate = new Date("2088-01-31");
    await prisma.accountMovement.create({ data: {
      tenantId, companyId, accountId: destination.id, type: "INFLOW", sourceType: "MANUAL_ADJUSTMENT",
      amount: "5", currency: "ARS", movementDate: legacyDate, description: "Movimiento legado",
    } });
    const transfer = await createInternalTransfer({
      ...transferInput(arsAccountId, destination.id, "2088-01-30"), valueDate: "2088-02-02",
    }, ctx);
    assert.equal(transfer.transferDate.toISOString().slice(0, 10), "2088-01-30");
    assert.equal(transfer.valueDate?.toISOString().slice(0, 10), "2088-02-02");
    const legs = await prisma.accountMovement.findMany({ where: { tenantId, sourceId: transfer.id } });
    assert.equal(legs.length, 2);
    assert.ok(legs.every(leg => leg.valueDate?.toISOString().slice(0, 10) === "2088-02-02"));
    const cutoff = new Date("2088-02-01");
    assert.equal((await getAccountBalanceAsOf(destination.id, { beforeDate: cutoff })).toFixed(2), "15.00");
    assert.equal((await getAccountBalanceAsOf(destination.id, { beforeDate: cutoff, dateBasis: "value" })).toFixed(2), "5.00");

    let session = await createBankReconciliation({
      accountId: destination.id, periodStart: "2088-02-01", periodEnd: "2088-02-29",
      openingBalance: "4", closingBalance: "14",
    }, ctx);
    assert.equal(session.systemClosingBalance, "15.00");
    assert.equal(session.bankClosingDifference, "-1.00");
    const [candidate] = await listCandidateMovementsForReconciliation(session.id, ctx);
    assert.equal(candidate?.id, legs.find(leg => leg.type === "TRANSFER_IN")?.id);
    assert.equal(candidate?.valueDate?.toISOString().slice(0, 10), "2088-02-02");
    session = await addBankStatementLine({
      reconciliationId: session.id, lineDate: "2088-02-02", amount: "10", direction: "CREDIT",
      description: "Acreditación de prueba", reference: null,
    }, ctx);
    session = await matchBankReconciliationLine({
      reconciliationId: session.id, statementLineId: session.lines[0]!.id, accountMovementId: candidate!.id,
    }, ctx);
    const period = { companyId, periodKey: "2088-01" };
    await closeFinancialPeriod(period, ctx);
    try {
      await assert.rejects(() => unmatchBankReconciliationLine(session.lines[0]!.match!.id, ctx), closedPeriod);
      const closed = await closeBankReconciliation(session.id, ctx);
      assert.equal(closed.status, "CLOSED");
      assert.equal(closed.bankClosingDifference, "-1.00");
    } finally {
      await reopenFinancialPeriod({ ...period, reason: "Reapertura de prueba" }, ctx);
    }
  });

  it("checks both company periods when a global user transfers or cancels across company-owned accounts", async () => {
    const source = await createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: `Origen ARS ${randomUUID()}`, type: "BANK", openingBalance: "40",
    }), ctx);
    const day = "2089-04-10";
    const period = { companyId: secondCompanyId, periodKey: "2089-04" };
    const op = transferInput(source.id, secondAccountId, day);
    await closeFinancialPeriod(period, second);
    await assert.rejects(() => createInternalTransfer(op, global), closedPeriod);
    await reopenFinancialPeriod({ ...period, reason: "Reapertura de prueba" }, second);
    const saved = await createInternalTransfer(op, global);
    await closeFinancialPeriod(period, second);
    await assert.rejects(() => cancelInternalTransfer(saved.id, global), closedPeriod);
    assert.equal((await getInternalTransferById(saved.id, global)).status, "CONFIRMED");
    await assert.rejects(() => reopenFinancialPeriod({ ...period, reason: "  " }, second), validation);
    await reopenFinancialPeriod({ ...period, reason: "Reapertura para cancelar" }, second);
    await cancelInternalTransfer(saved.id, global);
  });

  it("AG-14 rejects a conflicting OFX statement currency before importing and preserves legacy and CSV imports", async () => {
    const account = await createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: `Cuenta OFX ${randomUUID()}`, type: "BANK",
    }), ctx);
    const session = await createBankReconciliation({
      accountId: account.id, periodStart: "2089-06-01", periodEnd: "2089-06-30",
      openingBalance: "0", closingBalance: "37.50",
    }, ctx);
    const ofx = (currency: string | null, reference: string) => `<OFX><STMTRS>
${currency ? `<CURDEF>${currency}` : ""}
<BANKTRANLIST><STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20890602
<TRNAMT>12.50
<FITID>${reference}
<NAME>Ingreso de prueba
</STMTTRN></BANKTRANLIST></STMTRS></OFX>`;
    const importOfx = (currency: string | null, reference: string) => importBankStatementLinesFromOfx({
      reconciliationId: session.id, ofxText: ofx(currency, reference),
    }, ctx);
    await assert.rejects(() => importOfx("USD", "foreign-currency"), (error) =>
      validation(error) && (error as Error).message.includes("declara USD"));
    const unchanged = await getBankReconciliationById(session.id, ctx);
    assert.equal(unchanged.status, "DRAFT");
    assert.equal(unchanged.lines.length, 0);
    assert.equal(await prisma.accountMovement.count({ where: { tenantId, accountId: account.id } }), 0);

    assert.equal((await importOfx("ARS", "matching-currency")).importedCount, 1);
    assert.equal((await importOfx(null, "legacy-without-curdef")).importedCount, 1);
    const csv = await importBankStatementLinesFromCsv({
      reconciliationId: session.id,
      csvText: "fecha;descripcion;monto;direccion;referencia\n02/06/2089;Ingreso CSV;12,50;CREDIT;import-csv",
    }, ctx);
    assert.equal(csv.importedCount, 1);
    assert.equal(csv.lines.length, 3);
  });

  it("prevents duplicate bank movements after unmatch and preserves matches while the financial period is closed", async () => {
    const day = "2089-05-12";
    const account = await createTreasuryAccount(createTreasuryAccountSchema.parse({
      name: `Conciliación USD ${randomUUID()}`, type: "BANK", currency: "USD",
    }), ctx);
    let session = await createBankReconciliation({
      accountId: account.id, periodStart: "2089-05-01", periodEnd: "2089-05-31",
      openingBalance: "0", closingBalance: "10",
    }, ctx);
    session = await addBankStatementLine({
      reconciliationId: session.id, lineDate: day, direction: "CREDIT", amount: "10",
      description: "Crédito de prueba", reference: null,
    }, ctx);
    const op = { reconciliationId: session.id, statementLineId: session.lines[0]!.id };
    await assert.rejects(() => createMovementFromStatementLine(op, ctx), validation);
    session = await createMovementFromStatementLine({ ...op, fxRate: "1250.123456" }, ctx);
    const created = session.lines[0]!.match!;
    assert.equal((await movement(created.accountMovementId)).amountArs?.toFixed(2), "12501.23");
    await unmatchBankReconciliationLine(created.id, ctx);
    await assert.rejects(() => createMovementFromStatementLine({ ...op, fxRate: "1250.123456" }, ctx), conflict);
    assert.equal(await prisma.accountMovement.count({ where: { tenantId, sourceId: op.statementLineId } }), 1);
    session = await matchBankReconciliationLine({ ...op, accountMovementId: created.accountMovementId }, ctx);
    const period = { companyId, periodKey: "2089-05" };
    await closeFinancialPeriod(period, ctx);
    await assert.rejects(() => unmatchBankReconciliationLine(session.lines[0]!.match!.id, ctx), closedPeriod);
    await assert.rejects(() => removeBankStatementLine(op.statementLineId, ctx), closedPeriod);
    await assert.rejects(() => cancelBankReconciliation(session.id, ctx), closedPeriod);
    assert.equal((await movement(created.accountMovementId)).status, "RECONCILED");
    assert.equal((await getBankReconciliationById(session.id, ctx)).lines[0]?.match?.accountMovementId, created.accountMovementId);
    await reopenFinancialPeriod({ ...period, reason: "Reapertura de prueba" }, ctx);
    await closeBankReconciliation(session.id, ctx);
    await assert.rejects(() => reopenBankReconciliation({ reconciliationId: session.id, reason: "  " }, ctx), validation);
    session = await reopenBankReconciliation({ reconciliationId: session.id, reason: "Revisión de prueba" }, ctx);
    assert.equal(session.lines[0]?.match?.accountMovementId, created.accountMovementId);
  });

  it("rolls back treasury cancellation when the draft journal cancellation audit fails", async () => {
    const saved = await registerManualTreasuryAdjustment(adjustment(arsAccountId), ctx);
    const journal = await prisma.journalEntry.create({ data: {
      tenantId, companyId, sourceType: "TREASURY_INFLOW", sourceId: saved.id,
      description: "Asiento sintético", entryDate: new Date("2089-06-10"),
      createdByUserId: actorUserId, updatedByUserId: actorUserId,
    } });
    const journalPeriod = { companyId, periodKey: "2089-06" };
    await closeFinancialPeriod(journalPeriod, ctx);
    await assert.rejects(() => cancelAccountMovement(saved.id, ctx), closedPeriod);
    assert.equal((await movement(saved.id)).status, "CONFIRMED");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: journal.id } })).status, "DRAFT");
    await reopenFinancialPeriod({ ...journalPeriod, reason: "Reapertura para anular el asiento" }, ctx);
    const original = prisma.$transaction;
    const transaction = original.bind(prisma);
    prisma.$transaction = (async (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
      transaction(tx => run(new Proxy(tx, {
        get(target, property) {
          if (property !== "auditLog") return Reflect.get(target, property);
          return new Proxy(target.auditLog, {
            get(delegate, method) {
              if (method !== "create") return Reflect.get(delegate, method);
              return (args: Prisma.AuditLogCreateArgs) => {
                if (args.data.action === "journal_entry.cancelled") throw new Error("synthetic audit rollback");
                return delegate.create(args);
              };
            },
          });
        },
      })), options)) as typeof prisma.$transaction;
    try {
      await assert.rejects(() => cancelAccountMovement(saved.id, ctx), /synthetic audit rollback/);
    } finally {
      prisma.$transaction = original;
    }
    assert.equal((await movement(saved.id)).status, "CONFIRMED");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: journal.id } })).status, "DRAFT");
    await cancelAccountMovement(saved.id, ctx);
    assert.equal((await movement(saved.id)).status, "CANCELLED");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: journal.id } })).status, "CANCELLED");
  });
});
