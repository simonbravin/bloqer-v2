import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signedAmount(type: string, amount: Prisma.Decimal): Prisma.Decimal {
  return type === "INFLOW" || type === "TRANSFER_IN" ? amount : amount.negated();
}

function periodKey(date: Date, period: "day" | "week" | "month"): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (period === "day")   return `${y}-${m}-${d}`;
  if (period === "month") return `${y}-${m}`;
  // ISO week
  const tmp = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yr = tmp.getUTCFullYear();
  const jan1 = new Date(Date.UTC(yr, 0, 1));
  const wk = Math.ceil(((tmp.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${yr}-W${String(wk).padStart(2, "0")}`;
}

function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const to   = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo:   to.toISOString().slice(0, 10),
  };
}

const SOURCE_LABELS: Record<string, string> = {
  COLLECTION:        "Cobranza",
  INTERNAL_TRANSFER: "Transferencia interna",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  OPENING_BALANCE:   "Saldo inicial",
  PAYMENT:           "Pago",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type CashPositionAccount = {
  accountId:   string;
  name:        string;
  type:        string;
  currency:    string;
  status:      string;
  companyId:   string | null;
  companyName: string | null;
  balance:     string;
};

export type CashPositionByCurrency = {
  currency:     string;
  totalBalance: string;
};

export type CashPositionByCompany = {
  companyId:   string | null;
  companyName: string | null;
  byCurrency:  { currency: string; totalBalance: string }[];
};

export type CashPositionReport = {
  accounts:   CashPositionAccount[];
  byCurrency: CashPositionByCurrency[];
  byCompany:  CashPositionByCompany[];
};

export type MovementReportRow = {
  id:                 string;
  accountId:          string;
  accountName:        string;
  movementDate:       string;
  type:               string;
  sourceType:         string;
  sourceLabel:        string;
  amount:             string;
  signedAmount:       string;
  currency:           string;
  description:        string;
  transferId:         string | null;
  isInternalTransfer: boolean;
  runningBalance?:    string;
};

export type CashFlowBucket = {
  period:               string;
  inflow:               string;
  outflow:              string;
  internalTransferIn:   string;
  internalTransferOut:  string;
  adjustments:          string;
  netOperatingCashFlow: string;
  netCashFlow:          string;
};

export type CashFlowCurrency = {
  currency:       string;
  openingBalance: string;
  closingBalance: string;
  buckets:        CashFlowBucket[];
};

export type CashFlowReport = CashFlowCurrency[];

// ─── Filters ──────────────────────────────────────────────────────────────────

export type CashPositionFilters = {
  companyId?: string;
  currency?:  string;
};

export type MovementReportFilters = {
  accountId?:               string;
  dateFrom?:                string;
  dateTo?:                  string;
  type?:                    string;
  sourceType?:              string;
  currency?:                string;
  includeInternalTransfers?: boolean;
  /** When true: only `PAYMENT` movements whose source payment has `projectId` null (corporate AP outflows). */
  corporateApPaymentsOnly?: boolean;
};

export type CashFlowFilters = {
  dateFrom?:  string;
  dateTo?:    string;
  period?:    "day" | "week" | "month";
  currency?:  string;
};

// ─── Cash Position ────────────────────────────────────────────────────────────

export async function getCashPositionReport(
  filters: CashPositionFilters,
  ctx: ServiceContext,
): Promise<CashPositionReport> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de tesorería");
  }

  const accounts = await prisma.treasuryAccount.findMany({
    where: {
      tenantId:  ctx.tenantId,
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.currency  ? { currency:  filters.currency  } : {}),
    },
    include: { company: { select: { name: true } } },
    orderBy: [{ currency: "asc" }, { name: "asc" }],
  });

  const accountRows: CashPositionAccount[] = [];
  for (const acc of accounts) {
    const movements = await prisma.accountMovement.findMany({
      where: { accountId: acc.id, status: "CONFIRMED" },
      select: { type: true, amount: true },
    });
    const balance = movements.reduce(
      (sum, m) => sum.plus(signedAmount(m.type as string, m.amount)),
      acc.openingBalance,
    );
    accountRows.push({
      accountId:   acc.id,
      name:        acc.name,
      type:        acc.type as string,
      currency:    acc.currency,
      status:      acc.status as string,
      companyId:   acc.companyId,
      companyName: acc.company?.name ?? null,
      balance:     balance.toString(),
    });
  }

  // Group by currency
  const currencyMap = new Map<string, Prisma.Decimal>();
  for (const row of accountRows) {
    const prev = currencyMap.get(row.currency) ?? new Prisma.Decimal(0);
    currencyMap.set(row.currency, prev.plus(new Prisma.Decimal(row.balance)));
  }
  const byCurrency: CashPositionByCurrency[] = [...currencyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => ({ currency, totalBalance: total.toString() }));

  // Group by company
  const companyMap = new Map<string | null, {
    companyId: string | null; companyName: string | null;
    currencies: Map<string, Prisma.Decimal>;
  }>();
  for (const row of accountRows) {
    const key = row.companyId ?? "__none__";
    if (!companyMap.has(key)) {
      companyMap.set(key, { companyId: row.companyId, companyName: row.companyName, currencies: new Map() });
    }
    const entry = companyMap.get(key)!;
    const prev  = entry.currencies.get(row.currency) ?? new Prisma.Decimal(0);
    entry.currencies.set(row.currency, prev.plus(new Prisma.Decimal(row.balance)));
  }
  const byCompany: CashPositionByCompany[] = [...companyMap.values()].map((e) => ({
    companyId:   e.companyId,
    companyName: e.companyName,
    byCurrency:  [...e.currencies.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, total]) => ({ currency, totalBalance: total.toString() })),
  }));

  return { accounts: accountRows, byCurrency, byCompany };
}

// ─── Account Movement Report ──────────────────────────────────────────────────

export async function getAccountMovementReport(
  filters: MovementReportFilters,
  ctx: ServiceContext,
): Promise<MovementReportRow[]> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos");
  }

  let corporatePaymentIds: string[] | undefined;
  if (filters.corporateApPaymentsOnly) {
    const pays = await prisma.payment.findMany({
      where: {
        tenantId: ctx.tenantId,
        projectId: null,
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      },
      select: { id: true },
    });
    corporatePaymentIds = pays.map((p) => p.id);
    if (corporatePaymentIds.length === 0) {
      return [];
    }
  }

  // Tenant-guard for accountId
  if (filters.accountId) {
    const acc = await prisma.treasuryAccount.findUnique({
      where: { id: filters.accountId },
      select: { tenantId: true },
    });
    if (!acc || acc.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN", "Cuenta no encontrada o sin acceso");
    }
  }

  const rows = await prisma.accountMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      status:   "CONFIRMED",
      ...(filters.accountId  ? { accountId:  filters.accountId              } : {}),
      ...(filters.currency   ? { currency:   filters.currency               } : {}),
      ...(filters.type       ? { type:       filters.type as never          } : {}),
      ...(filters.sourceType ? { sourceType: filters.sourceType as never    } : {}),
      ...(filters.corporateApPaymentsOnly
        ? { sourceType: "PAYMENT", sourceId: { in: corporatePaymentIds! } }
        : {}),
      ...(filters.includeInternalTransfers === false ? { transferId: null } : {}),
      ...((filters.dateFrom || filters.dateTo) ? {
        movementDate: {
          ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
          ...(filters.dateTo   ? { lte: new Date(filters.dateTo)   } : {}),
        },
      } : {}),
    },
    include: { account: { select: { name: true } } },
    orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
  });

  // Compute opening balance for single-account running balance
  let runningBalance: Prisma.Decimal | undefined;
  if (filters.accountId) {
    const acc = await prisma.treasuryAccount.findUnique({
      where: { id: filters.accountId },
      select: { openingBalance: true },
    });
    const base = acc?.openingBalance ?? new Prisma.Decimal(0);
    if (filters.dateFrom) {
      const pre = await prisma.accountMovement.findMany({
        where: {
          accountId: filters.accountId,
          status: "CONFIRMED",
          movementDate: { lt: new Date(filters.dateFrom) },
        },
        select: { type: true, amount: true },
      });
      runningBalance = pre.reduce(
        (s, m) => s.plus(signedAmount(m.type as string, m.amount)),
        base,
      );
    } else {
      runningBalance = base;
    }
  }

  return rows.map((m) => {
    // ADJUSTMENT sign is unknown — display raw stored amount; omit from running balance
    const isAdj  = m.type === "ADJUSTMENT";
    const signed = isAdj ? m.amount : signedAmount(m.type as string, m.amount);
    if (runningBalance !== undefined && !isAdj) {
      runningBalance = runningBalance.plus(signed);
    }
    return {
      id:                 m.id,
      accountId:          m.accountId,
      accountName:        m.account.name,
      movementDate:       m.movementDate.toISOString().slice(0, 10),
      type:               m.type as string,
      sourceType:         m.sourceType as string,
      sourceLabel:        SOURCE_LABELS[m.sourceType as string] ?? m.sourceType,
      amount:             m.amount.toString(),
      signedAmount:       signed.toString(),
      currency:           m.currency,
      description:        m.description,
      transferId:         m.transferId,
      isInternalTransfer: m.transferId !== null,
      ...(runningBalance !== undefined ? { runningBalance: runningBalance.toString() } : {}),
    };
  });
}

// ─── Cash Flow Report ─────────────────────────────────────────────────────────

export async function getCashFlowReport(
  filters: CashFlowFilters,
  ctx: ServiceContext,
): Promise<CashFlowReport> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver flujo de caja");
  }

  const range    = (filters.dateFrom && filters.dateTo) ? filters : defaultDateRange();
  const dateFrom = range.dateFrom!;
  const dateTo   = range.dateTo!;
  const period   = filters.period ?? "month";
  const startDate = new Date(dateFrom);
  const endDate   = new Date(dateTo);

  const movements = await prisma.accountMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      status:   "CONFIRMED",
      ...(filters.currency ? { currency: filters.currency } : {}),
      movementDate: { gte: startDate, lte: endDate },
    },
    select: { type: true, amount: true, currency: true, movementDate: true },
    orderBy: { movementDate: "asc" },
  });

  const currencies = filters.currency
    ? [filters.currency]
    : [...new Set(movements.map((m) => m.currency))].sort();

  if (currencies.length === 0) return [];

  const allAccounts = await prisma.treasuryAccount.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters.currency ? { currency: filters.currency } : {}),
    },
    select: { openingBalance: true, currency: true, id: true },
  });

  const result: CashFlowReport = [];

  for (const currency of currencies) {
    const currAccounts = allAccounts.filter((a) => a.currency === currency);
    const accountIds   = currAccounts.map((a) => a.id);

    // Balance as of startDate (pre-period)
    const baseBalance = currAccounts.reduce(
      (s, a) => s.plus(a.openingBalance),
      new Prisma.Decimal(0),
    );
    const preMovements = await prisma.accountMovement.findMany({
      where: {
        tenantId:    ctx.tenantId,
        currency,
        status:      "CONFIRMED",
        accountId:   { in: accountIds },
        movementDate: { lt: startDate },
      },
      select: { type: true, amount: true },
    });
    const openingBalance = preMovements.reduce(
      (s, m) => s.plus(signedAmount(m.type as string, m.amount)),
      baseBalance,
    );

    // Bucket movements in range
    type BucketAcc = {
      inflow: Prisma.Decimal; outflow: Prisma.Decimal;
      internalTransferIn: Prisma.Decimal; internalTransferOut: Prisma.Decimal;
      adjustments: Prisma.Decimal;
    };
    const bucketMap = new Map<string, BucketAcc>();

    for (const m of movements.filter((mv) => mv.currency === currency)) {
      const key = periodKey(m.movementDate, period);
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          inflow:              new Prisma.Decimal(0),
          outflow:             new Prisma.Decimal(0),
          internalTransferIn:  new Prisma.Decimal(0),
          internalTransferOut: new Prisma.Decimal(0),
          adjustments:         new Prisma.Decimal(0),
        });
      }
      const b = bucketMap.get(key)!;
      switch (m.type as string) {
        case "INFLOW":       b.inflow              = b.inflow.plus(m.amount);             break;
        case "OUTFLOW":      b.outflow             = b.outflow.plus(m.amount);            break;
        case "TRANSFER_IN":  b.internalTransferIn  = b.internalTransferIn.plus(m.amount); break;
        case "TRANSFER_OUT": b.internalTransferOut = b.internalTransferOut.plus(m.amount); break;
        case "ADJUSTMENT":   b.adjustments         = b.adjustments.plus(m.amount);        break;
      }
    }

    let running = openingBalance;
    const buckets: CashFlowBucket[] = [...bucketMap.keys()].sort().map((key) => {
      const b      = bucketMap.get(key)!;
      const netOp  = b.inflow.minus(b.outflow);
      // ADJUSTMENT excluded — sign convention pending manual adjustment module
      const netAll = netOp.plus(b.internalTransferIn).minus(b.internalTransferOut);
      running = running.plus(netAll);
      return {
        period:               key,
        inflow:               b.inflow.toString(),
        outflow:              b.outflow.toString(),
        internalTransferIn:   b.internalTransferIn.toString(),
        internalTransferOut:  b.internalTransferOut.toString(),
        adjustments:          b.adjustments.toString(),
        netOperatingCashFlow: netOp.toString(),
        netCashFlow:          netAll.toString(),
      };
    });

    result.push({
      currency,
      openingBalance: openingBalance.toString(),
      closingBalance: running.toString(),
      buckets,
    });
  }

  return result;
}
