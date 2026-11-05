import { Prisma, prisma, type AccountType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { resolveAccountingCompanyId } from "./accounting-company-context";
import {
  entryDateGte,
  entryDateLte,
  parseAccountingAsOfDate,
  parseAccountingDateRange,
} from "./accounting-date";
import { naturalBalance, naturalBalanceSignedString } from "./accounting-natural-balance";
import { getAccountLedger, normalizeJournalCurrency } from "./journal-entry.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";

export type AccountingReportDateRange = {
  companyId?: string | null;
  dateFrom?: string;
  dateTo?: string;
};

export type TrialBalanceReportRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  debit: string;
  credit: string;
  balance: string;
};

export type PostedJournalBookLine = {
  accountCode: string;
  accountName: string;
  description: string | null;
  debit: string;
  credit: string;
  currency: string;
};

export type PostedJournalBookEntry = {
  id: string;
  entryDate: string;
  reference: string | null;
  description: string;
  sourceType: string;
  lines: PostedJournalBookLine[];
};

export type StatementSectionRow = {
  accountId: string | null;
  accountCode: string;
  accountName: string;
  currency: string;
  balance: string;
  synthetic?: boolean;
};

export type StatementOfFinancialPosition = {
  asOfDate: string;
  companyId: string;
  currencies: string[];
  byCurrency: Record<
    string,
    {
      assets: StatementSectionRow[];
      liabilities: StatementSectionRow[];
      equity: StatementSectionRow[];
      totalAssets: string;
      totalLiabilities: string;
      totalEquity: string;
      balanced: boolean;
    }
  >;
};

export type IncomeStatement = {
  dateFrom: string;
  dateTo: string;
  companyId: string;
  currencies: string[];
  byCurrency: Record<
    string,
    {
      income: StatementSectionRow[];
      expenses: StatementSectionRow[];
      totalIncome: string;
      totalExpenses: string;
      netResult: string;
    }
  >;
};

async function assertView(ctx: ServiceContext): Promise<void> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver contabilidad");
  }
}

function entryDateFilter(dateFrom?: string, dateTo?: string, asOfDate?: string): Prisma.DateTimeFilter {
  const f: Prisma.DateTimeFilter = {};
  if (asOfDate) {
    f.lte = entryDateLte(asOfDate);
    return f;
  }
  if (dateFrom) f.gte = entryDateGte(dateFrom);
  if (dateTo) f.lte = entryDateLte(dateTo);
  return f;
}

type Agg = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

async function aggregatePostedLines(
  ctx: ServiceContext,
  companyId: string,
  dateFilter: Prisma.DateTimeFilter,
  types?: AccountType[],
): Promise<Agg[]> {
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        tenantId: ctx.tenantId,
        companyId,
        status: "POSTED",
        ...(Object.keys(dateFilter).length > 0 ? { entryDate: dateFilter } : {}),
      },
      account: { tenantId: ctx.tenantId, companyId, ...(types ? { type: { in: types } } : {}) },
    },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  });

  const map = new Map<string, Agg>();
  for (const l of lines) {
    const currency = normalizeJournalCurrency(l.currency);
    const key = `${l.accountId}|${currency}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        accountId: l.account.id,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountType: l.account.type,
        currency,
        debit: l.debit,
        credit: l.credit,
      });
    } else {
      cur.debit = cur.debit.plus(l.debit);
      cur.credit = cur.credit.plus(l.credit);
    }
  }
  return [...map.values()].sort(
    (a, b) => a.accountCode.localeCompare(b.accountCode) || a.currency.localeCompare(b.currency),
  );
}

export async function getTrialBalanceReport(
  ctx: ServiceContext,
  input: AccountingReportDateRange,
): Promise<{ dateFrom: string; dateTo: string; companyId: string; rows: TrialBalanceReportRow[] }> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  const { dateFrom, dateTo } = parseAccountingDateRange(input);
  const aggs = await aggregatePostedLines(ctx, companyId, entryDateFilter(dateFrom, dateTo));
  return {
    dateFrom,
    dateTo,
    companyId,
    rows: aggs.map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      currency: r.currency,
      debit: serializeMoneyDecimal(r.debit),
      credit: serializeMoneyDecimal(r.credit),
      balance: naturalBalanceSignedString(r.accountType, r.debit, r.credit),
    })),
  };
}

async function loadPostedJournalBook(
  ctx: ServiceContext,
  input: AccountingReportDateRange,
  pagination: { skip: number; take: number; exportAll?: boolean },
): Promise<{
  dateFrom: string;
  dateTo: string;
  companyId: string;
  total: number;
  data: PostedJournalBookEntry[];
}> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  const { dateFrom, dateTo } = parseAccountingDateRange(input);

  const where: Prisma.JournalEntryWhereInput = {
    tenantId: ctx.tenantId,
    companyId,
    status: "POSTED",
    entryDate: {
      gte: entryDateGte(dateFrom),
      lte: entryDateLte(dateTo),
    },
  };

  const { rows, total } = await prisma.$transaction(async (tx) => {
    const total = await tx.journalEntry.count({ where });
    // Exports reject a range above their cap. Avoid fetching those lines just to discard them.
    if (pagination.exportAll && total > pagination.take) return { rows: [], total };
    const rows = await tx.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: "asc" }, { id: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: {
        lines: { include: { account: true }, orderBy: { id: "asc" } },
      },
    });
    return { rows, total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  if (rows.some(entry => entry.lines.some(line => line.account.tenantId !== ctx.tenantId || line.account.companyId !== companyId))) {
    throw new ServiceError("CONFLICT", "El libro contiene asientos con cuentas fuera de su empresa");
  }

  return {
    dateFrom,
    dateTo,
    companyId,
    total,
    data: rows.map((e) => ({
      id: e.id,
      entryDate: e.entryDate.toISOString().slice(0, 10),
      reference: e.reference,
      description: e.description,
      sourceType: e.sourceType,
      lines: e.lines.map((l) => ({
        accountCode: l.account.code,
        accountName: l.account.name,
        description: l.description,
        debit: serializeMoneyDecimal(l.debit),
        credit: serializeMoneyDecimal(l.credit),
        currency: normalizeJournalCurrency(l.currency),
      })),
    })),
  };
}

export async function listPostedJournalBook(
  ctx: ServiceContext,
  input: AccountingReportDateRange & { page?: number; pageSize?: number },
) {
  const take = Number.isSafeInteger(input.pageSize) ? Math.max(1, Math.min(input.pageSize!, 500)) : 100;
  const page = Number.isSafeInteger(input.page) ? Math.max(1, input.page!) : 1;
  const skip = (page - 1) * take;
  return loadPostedJournalBook(ctx, input, { skip: skip > 2_147_483_647 ? 0 : skip, take });
}

/** Full book for export (capped). */
export async function listPostedJournalBookForExport(
  ctx: ServiceContext,
  input: AccountingReportDateRange,
  maxEntries = 5000,
): Promise<{ dateFrom: string; dateTo: string; companyId: string; total: number; data: PostedJournalBookEntry[] }> {
  const take = Number.isSafeInteger(maxEntries) ? Math.max(1, Math.min(10_000, maxEntries)) : 5000;
  return loadPostedJournalBook(ctx, input, { skip: 0, take, exportAll: true });
}

export async function getAccountLedgerReport(
  ctx: ServiceContext,
  input: AccountingReportDateRange & { accountId: string; limit?: number },
): Promise<{
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  dateFrom: string;
  dateTo: string;
  companyId: string;
  truncated: boolean;
  rows: Awaited<ReturnType<typeof getAccountLedger>>["rows"];
}> {
  await assertView(ctx);
  const { dateFrom, dateTo } = parseAccountingDateRange(input);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  const account = await prisma.accountingAccount.findFirst({
    where: { id: input.accountId, tenantId: ctx.tenantId, companyId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!account) throw new ServiceError("NOT_FOUND", "Cuenta contable no encontrada");

  const ledger = await getAccountLedger(ctx, {
    accountId: input.accountId,
    companyId,
    dateFrom,
    dateTo,
    limit: input.limit ?? 2000,
  });

  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    accountType: account.type,
    dateFrom,
    dateTo,
    companyId,
    truncated: ledger.truncated,
    rows: ledger.rows,
  };
}

export async function getStatementOfFinancialPosition(
  ctx: ServiceContext,
  input: { companyId?: string | null; asOfDate?: string },
): Promise<StatementOfFinancialPosition> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  const asOfDate = parseAccountingAsOfDate(input.asOfDate);
  const filter = entryDateFilter(undefined, undefined, asOfDate);

  const balanceSheetTypes: AccountType[] = ["ASSET", "LIABILITY", "EQUITY"];
  const plTypes: AccountType[] = ["INCOME", "EXPENSE"];
  const allAggs = await aggregatePostedLines(ctx, companyId, filter);
  const bsAggs = allAggs.filter(row => balanceSheetTypes.includes(row.accountType));
  const plAggs = allAggs.filter(row => plTypes.includes(row.accountType));

  const currencies = new Set<string>();
  for (const r of bsAggs) currencies.add(r.currency);
  for (const r of plAggs) currencies.add(r.currency);
  if (currencies.size === 0) currencies.add("ARS");

  const byCurrency: StatementOfFinancialPosition["byCurrency"] = {};

  for (const currency of [...currencies].sort()) {
    const assets: StatementSectionRow[] = [];
    const liabilities: StatementSectionRow[] = [];
    const equity: StatementSectionRow[] = [];
    let totalAssets = new Prisma.Decimal(0);
    let totalLiabilities = new Prisma.Decimal(0);
    let totalEquity = new Prisma.Decimal(0);

    for (const r of bsAggs.filter((x) => x.currency === currency)) {
      const bal = naturalBalance(r.accountType, r.debit, r.credit);
      if (bal.isZero()) continue;
      const row: StatementSectionRow = {
        accountId: r.accountId,
        accountCode: r.accountCode,
        accountName: r.accountName,
        currency,
        balance: serializeMoneyDecimal(bal),
      };
      if (r.accountType === "ASSET") {
        assets.push(row);
        totalAssets = totalAssets.plus(bal);
      } else if (r.accountType === "LIABILITY") {
        liabilities.push(row);
        totalLiabilities = totalLiabilities.plus(bal);
      } else {
        equity.push(row);
        totalEquity = totalEquity.plus(bal);
      }
    }

    let netPl = new Prisma.Decimal(0);
    for (const r of plAggs.filter((x) => x.currency === currency)) {
      const bal = naturalBalance(r.accountType, r.debit, r.credit);
      if (r.accountType === "INCOME") netPl = netPl.plus(bal);
      else netPl = netPl.minus(bal);
    }
    if (!netPl.isZero()) {
      equity.push({
        accountId: null,
        accountCode: "—",
        accountName: "Resultado del ejercicio (no cerrado)",
        currency,
        balance: serializeMoneyDecimal(netPl),
        synthetic: true,
      });
      totalEquity = totalEquity.plus(netPl);
    }

    const rhs = totalLiabilities.plus(totalEquity);
    byCurrency[currency] = {
      assets,
      liabilities,
      equity,
      totalAssets: serializeMoneyDecimal(totalAssets),
      totalLiabilities: serializeMoneyDecimal(totalLiabilities),
      totalEquity: serializeMoneyDecimal(totalEquity),
      balanced: totalAssets.equals(rhs),
    };
  }

  return {
    asOfDate,
    companyId,
    currencies: Object.keys(byCurrency).sort(),
    byCurrency,
  };
}

export async function getIncomeStatement(
  ctx: ServiceContext,
  input: AccountingReportDateRange,
): Promise<IncomeStatement> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  const { dateFrom, dateTo } = parseAccountingDateRange(input);
  const aggs = await aggregatePostedLines(
    ctx,
    companyId,
    entryDateFilter(dateFrom, dateTo),
    ["INCOME", "EXPENSE"],
  );

  const currencies = new Set(aggs.map((a) => a.currency));
  if (currencies.size === 0) currencies.add("ARS");

  const byCurrency: IncomeStatement["byCurrency"] = {};
  for (const currency of [...currencies].sort()) {
    const income: StatementSectionRow[] = [];
    const expenses: StatementSectionRow[] = [];
    let totalIncome = new Prisma.Decimal(0);
    let totalExpenses = new Prisma.Decimal(0);

    for (const r of aggs.filter((x) => x.currency === currency)) {
      const bal = naturalBalance(r.accountType, r.debit, r.credit);
      if (bal.isZero()) continue;
      const row: StatementSectionRow = {
        accountId: r.accountId,
        accountCode: r.accountCode,
        accountName: r.accountName,
        currency,
        balance: serializeMoneyDecimal(bal),
      };
      if (r.accountType === "INCOME") {
        income.push(row);
        totalIncome = totalIncome.plus(bal);
      } else {
        expenses.push(row);
        totalExpenses = totalExpenses.plus(bal);
      }
    }

    byCurrency[currency] = {
      income,
      expenses,
      totalIncome: serializeMoneyDecimal(totalIncome),
      totalExpenses: serializeMoneyDecimal(totalExpenses),
      netResult: serializeMoneyDecimal(totalIncome.minus(totalExpenses)),
    };
  }

  return {
    dateFrom,
    dateTo,
    companyId,
    currencies: Object.keys(byCurrency).sort(),
    byCurrency,
  };
}
