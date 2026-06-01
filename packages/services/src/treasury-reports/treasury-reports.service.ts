import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { DEFAULT_CASH_DATE_RANGE_DAYS, defaultDateRangeDays, MAX_CORPORATE_PAYMENT_FILTER_IDS, resolvePagination } from "../finance/pagination";
import { getAccountBalance, getAccountBalanceAsOf } from "../treasury/balance.service";

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
  projectId:          string | null;
  projectName:        string | null;
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
  companyId?:               string;
  dateFrom?:                string;
  dateTo?:                  string;
  type?:                    string;
  sourceType?:              string;
  currency?:                string;
  includeInternalTransfers?: boolean;
  /** When true: only `PAYMENT` movements whose source payment has `projectId` null (corporate AP outflows). */
  corporateApPaymentsOnly?: boolean;
  /** Filter movements imputed to a specific project (`AccountMovement.projectId`). */
  projectId?:               string;
  /** When true: only movements without project (`projectId` null). */
  corporateOnly?:           boolean;
  /** When true: only movements with a project (`projectId` not null). */
  projectOnly?:             boolean;
  page?:                    number;
  pageSize?:                number;
};

export type MovementReportResult = {
  rows: MovementReportRow[];
  total: number;
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
    const balance = await getAccountBalance(acc.id);
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

type RawMovementRow = {
  id: string;
  accountId: string;
  movementDate: Date;
  type: string;
  sourceType: string;
  sourceId: string;
  amount: Prisma.Decimal;
  currency: string;
  description: string;
  transferId: string | null;
  projectId: string | null;
  account: { name: string };
};

async function resolveMovementProjectIds(
  rawRows: RawMovementRow[],
  tenantId: string,
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  for (const m of rawRows) {
    resolved.set(m.id, m.projectId);
  }

  const paymentSourceIds = rawRows
    .filter((m) => m.projectId === null && m.sourceType === "PAYMENT")
    .map((m) => m.sourceId);
  const collectionSourceIds = rawRows
    .filter((m) => m.projectId === null && m.sourceType === "COLLECTION")
    .map((m) => m.sourceId);

  const [payments, collections] = await Promise.all([
    paymentSourceIds.length > 0
      ? prisma.payment.findMany({
          where: { tenantId, id: { in: paymentSourceIds } },
          select: { id: true, projectId: true },
        })
      : Promise.resolve([]),
    collectionSourceIds.length > 0
      ? prisma.collection.findMany({
          where: { tenantId, id: { in: collectionSourceIds } },
          select: { id: true, projectId: true },
        })
      : Promise.resolve([]),
  ]);

  const paymentProject = new Map(payments.map((p) => [p.id, p.projectId]));
  const collectionProject = new Map(collections.map((c) => [c.id, c.projectId]));

  for (const m of rawRows) {
    if (m.projectId !== null) continue;
    if (m.sourceType === "PAYMENT") {
      resolved.set(m.id, paymentProject.get(m.sourceId) ?? null);
    } else if (m.sourceType === "COLLECTION") {
      resolved.set(m.id, collectionProject.get(m.sourceId) ?? null);
    }
  }

  return resolved;
}

async function loadProjectNames(
  tenantId: string,
  projectIds: string[],
): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map();
  const projects = await prisma.project.findMany({
    where: { tenantId, id: { in: projectIds } },
    select: { id: true, name: true },
  });
  return new Map(projects.map((p) => [p.id, p.name]));
}

async function movementProjectWhere(
  filters: MovementReportFilters,
  tenantId: string,
): Promise<Prisma.AccountMovementWhereInput> {
  if (filters.projectId) {
    const [payments, collections] = await Promise.all([
      prisma.payment.findMany({
        where: { tenantId, projectId: filters.projectId },
        select: { id: true },
      }),
      prisma.collection.findMany({
        where: { tenantId, projectId: filters.projectId },
        select: { id: true },
      }),
    ]);

    const paymentIds = payments.map((p) => p.id);
    const collectionIds = collections.map((c) => c.id);
    return {
      OR: [
        { projectId: filters.projectId },
        ...(paymentIds.length > 0
          ? [{ sourceType: "PAYMENT", sourceId: { in: paymentIds } } as Prisma.AccountMovementWhereInput]
          : []),
        ...(collectionIds.length > 0
          ? [{ sourceType: "COLLECTION", sourceId: { in: collectionIds } } as Prisma.AccountMovementWhereInput]
          : []),
      ],
    };
  }
  if (filters.corporateOnly) {
    return { projectId: null };
  }
  if (filters.projectOnly) {
    return { projectId: { not: null } };
  }
  return {};
}

// ─── Account Movement Report ──────────────────────────────────────────────────

export async function getAccountMovementReport(
  filters: MovementReportFilters,
  ctx: ServiceContext,
): Promise<MovementReportResult> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos");
  }

  const paginated = filters.page !== undefined || filters.pageSize !== undefined;
  const { page, pageSize, skip, take } = resolvePagination(
    paginated ? { page: filters.page, pageSize: filters.pageSize } : undefined,
  );

  let dateFrom = filters.dateFrom;
  let dateTo = filters.dateTo;
  if (paginated && (!dateFrom || !dateTo)) {
    const defaults = defaultDateRangeDays(DEFAULT_CASH_DATE_RANGE_DAYS);
    dateFrom = dateFrom ?? defaults.dateFrom;
    dateTo = dateTo ?? defaults.dateTo;
  }

  const companyId = filters.companyId ?? ctx.companyId ?? undefined;

  let corporatePaymentIds: string[] | undefined;
  if (filters.corporateApPaymentsOnly) {
    const paymentWhere = {
      tenantId: ctx.tenantId,
      projectId: null as null,
      ...(companyId ? { companyId } : {}),
    };
    const paymentCount = await prisma.payment.count({ where: paymentWhere });
    if (paymentCount === 0) {
      return { rows: [], total: 0 };
    }
    if (paymentCount > MAX_CORPORATE_PAYMENT_FILTER_IDS) {
      throw new ServiceError(
        "VALIDATION",
        "Demasiados pagos corporativos para filtrar. Acotá el rango de fechas o usá Tesorería.",
      );
    }
    const pays = await prisma.payment.findMany({
      where: paymentWhere,
      select: { id: true },
    });
    corporatePaymentIds = pays.map((p) => p.id);
  }

  if (filters.accountId) {
    const acc = await prisma.treasuryAccount.findUnique({
      where: { id: filters.accountId },
      select: { tenantId: true },
    });
    if (!acc || acc.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN", "Cuenta no encontrada o sin acceso");
    }
  }

  const projectWhere = await movementProjectWhere(filters, ctx.tenantId);

  const where: Prisma.AccountMovementWhereInput = {
    tenantId: ctx.tenantId,
    status: "CONFIRMED",
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.currency ? { currency: filters.currency } : {}),
    ...(filters.type ? { type: filters.type as never } : {}),
    ...(filters.sourceType ? { sourceType: filters.sourceType as never } : {}),
    ...(filters.corporateApPaymentsOnly
      ? { sourceType: "PAYMENT", sourceId: { in: corporatePaymentIds! } }
      : {}),
    ...(filters.includeInternalTransfers === false ? { transferId: null } : {}),
    ...(dateFrom || dateTo
      ? {
          movementDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
    ...(companyId ? { account: { companyId } } : {}),
    ...projectWhere,
  };

  const orderBy = paginated
    ? ([{ movementDate: "desc" as const }, { id: "desc" as const }] as const)
    : ([{ movementDate: "asc" as const }, { createdAt: "asc" as const }] as const);

  const [rawRows, total] = await Promise.all([
    prisma.accountMovement.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: [...orderBy],
      ...(paginated ? { skip, take } : {}),
    }),
    paginated ? prisma.accountMovement.count({ where }) : Promise.resolve(0),
  ]);

  let runningBalance: Prisma.Decimal | undefined;
  if (!paginated && filters.accountId) {
    runningBalance = await getAccountBalanceAsOf(
      filters.accountId,
      dateFrom ? { beforeDate: new Date(dateFrom) } : undefined,
    );
  }

  const typedRawRows = rawRows as RawMovementRow[];
  const projectIdByMovement = await resolveMovementProjectIds(typedRawRows, ctx.tenantId);
  const uniqueProjectIds = [
    ...new Set(
      [...projectIdByMovement.values()].filter((id): id is string => id !== null),
    ),
  ];
  const projectNames = await loadProjectNames(ctx.tenantId, uniqueProjectIds);

  const rows: MovementReportRow[] = typedRawRows.map((m) => {
    const isAdj = m.type === "ADJUSTMENT";
    const signed = isAdj ? m.amount : signedAmount(m.type as string, m.amount);
    if (runningBalance !== undefined && !isAdj) {
      runningBalance = runningBalance.plus(signed);
    }
    const resolvedProjectId = projectIdByMovement.get(m.id) ?? null;
    return {
      id: m.id,
      accountId: m.accountId,
      accountName: m.account.name,
      movementDate: m.movementDate.toISOString().slice(0, 10),
      type: m.type as string,
      sourceType: m.sourceType as string,
      sourceLabel: SOURCE_LABELS[m.sourceType as string] ?? m.sourceType,
      amount: m.amount.toString(),
      signedAmount: signed.toString(),
      currency: m.currency,
      description: m.description,
      transferId: m.transferId,
      isInternalTransfer: m.transferId !== null,
      projectId: resolvedProjectId,
      projectName: resolvedProjectId ? (projectNames.get(resolvedProjectId) ?? null) : null,
      ...(runningBalance !== undefined ? { runningBalance: runningBalance.toString() } : {}),
    };
  });

  return { rows, total: paginated ? total : rows.length };
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

    // Balance as of startDate (pre-period, P-TRZ-06 safe per account)
    let openingBalance = new Prisma.Decimal(0);
    for (const acc of currAccounts) {
      openingBalance = openingBalance.plus(
        await getAccountBalanceAsOf(acc.id, { beforeDate: startDate }),
      );
    }

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
