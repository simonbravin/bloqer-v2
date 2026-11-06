import { AccountMovementSourceType, AccountMovementType, Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { isUuid } from "@bloqer/utils";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { DEFAULT_CASH_DATE_RANGE_DAYS, defaultDateRangeDays, MAX_CORPORATE_PAYMENT_FILTER_IDS, MAX_EXPORT_ROWS, resolvePagination } from "../finance/pagination";
import { buildFinancialHref } from "../finance/financial-trace.service";
import { serializeFxRateDecimal, serializeMoneyDecimal } from "../finance/money-decimal";
import { getAccountBalanceAsOf, getAccountBalancesForAccounts } from "../treasury/balance.service";
import { BALANCE_AFFECTING_MOVEMENT_STATUSES } from "../treasury/balance-affecting-statuses";
import { defaultReportDateRange } from "../reports/report-month";
import {
  accountMovementClassWhere,
  classFieldsForAccountMovement,
  parseMovementClassFilter,
} from "../finance/document-class.service";
import {
  displayMovementDescription,
} from "./movement-document-ref";
import {
  documentRefForCashSource,
  loadCashSourceMeta,
} from "./cash-source-meta";

import { cashPositionAmounts, cashPositionCurrency, consolidateCashPositionArs, signedTreasuryAmount } from "./cash-position-amounts";

export { displayMovementDescription } from "./movement-document-ref";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function cashReportDate(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

const SOURCE_LABELS: Record<string, string> = {
  COLLECTION:        "Cobranza",
  INTERNAL_TRANSFER: "Transferencia interna",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  OPENING_BALANCE:   "Saldo inicial",
  PAYMENT:           "Pago",
};

function movementSourceLabel(
  sourceType: string,
  counterpartyName: string | null,
  externalInvoiceRef: string | null,
): string {
  if (sourceType === "MANUAL_ADJUSTMENT" && (counterpartyName || externalInvoiceRef)) {
    return "Ingreso / cobro";
  }
  return SOURCE_LABELS[sourceType] ?? sourceType;
}

/** Deep-link to the document that originated this cash line (not a generic movement page). */
export function resolveMovementDetailHref(input: {
  sourceType: string;
  sourceId: string;
  projectId: string | null;
  accountId: string;
  transferId: string | null;
}): string | null {
  const { sourceType, sourceId, projectId } = input;
  if (!sourceId?.trim()) return null;

  switch (sourceType) {
    case "PAYMENT":
      return buildFinancialHref("Payment", sourceId, { projectId });
    case "COLLECTION":
      // Corporate collections have no dedicated detail route (only project cobranzas).
      if (!projectId) return null;
      return buildFinancialHref("Collection", sourceId, { projectId });
    case "INTERNAL_TRANSFER":
      // Canonical list for own-account transfers (no dedicated detail route yet).
      return "/tesoreria/transferencias";
    case "OPENING_BALANCE":
    case "MANUAL_ADJUSTMENT":
      // No separate document; avoid a weak link to the whole account extract.
      return null;
    default:
      return null;
  }
}

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
  balanceArs:  string | null;
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
  /** Historical ARS equivalents of all balance contributions. Not current FX valuation. */
  consolidatedArs: string | null;
};

export type MovementReportRow = {
  id:                 string;
  accountId:          string;
  accountName:        string;
  movementDate:       string;
  valueDate:          string | null;
  type:               string;
  status:             string;
  sourceType:         string;
  sourceId:           string;
  sourceLabel:        string;
  amount:             string;
  signedAmount:       string;
  currency:           string;
  fxRate:             string | null;
  amountArs:          string | null;
  description:        string;
  /** Deep-link to source document when available. */
  detailHref:         string | null;
  transferId:         string | null;
  isInternalTransfer: boolean;
  projectId:          string | null;
  projectName:        string | null;
  counterpartyName:   string | null;
  /** Internal invoice code (FP-##### / FAC-#####) for PAYMENT/COLLECTION; else null. */
  documentRef:        string | null;
  externalInvoiceRef: string | null;
  runningBalance?:    string;
  /** Derived document class ([D-102]). */
  classCode:          string;
  classLabel:         string;
  classFamily:        string;
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
  /** Derived document class filter ([D-102]). */
  class?:                   string;
  page?:                    number;
  pageSize?:                number;
  /** Sort by movementDate; default desc (recent first). */
  sortDir?:                 "asc" | "desc";
  /** Extracts use the accounting date by default; legacy rows fall back when value date is missing. */
  dateBasis?:               "accounting" | "value";
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

export function getCashFlowDateRange(filters: Pick<CashFlowFilters, "dateFrom" | "dateTo">) {
  const fallback = defaultReportDateRange();
  return {
    dateFrom: cashReportDate(filters.dateFrom) ?? fallback.dateFrom,
    dateTo: cashReportDate(filters.dateTo) ?? fallback.dateTo,
  };
}

// ─── Cash Position ────────────────────────────────────────────────────────────

export function treasuryReportAccountScope(tenantId: string, companyId?: string): Prisma.TreasuryAccountWhereInput {
  return {
    tenantId,
    OR: [{ companyId: null }, { company: { tenantId } }],
    ...(companyId ? { companyId } : {}),
  };
}

export async function getCashPositionReport(
  filters: CashPositionFilters,
  ctx: ServiceContext,
): Promise<CashPositionReport> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de tesorería");
  }
  if (filters.companyId && !isUuid(filters.companyId)) {
    throw new ServiceError("VALIDATION", "Empresa inválida");
  }

  const scopedAccounts = await prisma.treasuryAccount.findMany({
    where: treasuryReportAccountScope(ctx.tenantId, filters.companyId),
    include: { company: { select: { tenantId: true, name: true } } },
    orderBy: [{ currency: "asc" }, { name: "asc" }],
  });
  const currencyFilter = filters.currency ? cashPositionCurrency(filters.currency) : undefined;
  // Filter and group legacy spellings on their canonical read value without rewriting history.
  const accounts = scopedAccounts
    .map((account) => ({ ...account, currency: cashPositionCurrency(account.currency) }))
    .filter((account) => !currencyFilter || account.currency === currencyFilter);

  const accountIds = accounts.map(({ id }) => id);
  const movements = await prisma.accountMovement.groupBy({
    where: {
      tenantId: ctx.tenantId,
      accountId: { in: accountIds },
      OR: [
        { status: { in: [...BALANCE_AFFECTING_MOVEMENT_STATUSES] } },
        { sourceType: "OPENING_BALANCE" },
      ],
    },
    by: ["accountId", "currency", "type", "status", "sourceType"],
    _sum: { amount: true, amountArs: true },
    _count: { _all: true, amountArs: true, fxRate: true },
    _min: { fxRate: true },
  });
  const groupsByAccount = new Map<string, typeof movements>();
  for (const group of movements) {
    const groups = groupsByAccount.get(group.accountId) ?? [];
    groups.push(group);
    groupsByAccount.set(group.accountId, groups);
  }

  const amounts = accounts.map((account) => cashPositionAmounts(account, groupsByAccount.get(account.id) ?? []));
  const accountRows: CashPositionAccount[] = accounts.map((acc, index) => {
    const { balance, balanceArs } = amounts[index]!;
    return {
      accountId:   acc.id,
      name:        acc.name,
      type:        acc.type as string,
      currency:    acc.currency,
      status:      acc.status as string,
      companyId:   acc.companyId,
      companyName: acc.company?.tenantId === ctx.tenantId ? acc.company.name : null,
      balance:     serializeMoneyDecimal(balance),
      balanceArs:  balanceArs === null ? null : serializeMoneyDecimal(balanceArs),
    };
  });

  // Group by currency
  const currencyMap = new Map<string, Prisma.Decimal>();
  for (const row of accountRows) {
    const prev = currencyMap.get(row.currency) ?? new Prisma.Decimal(0);
    currencyMap.set(row.currency, prev.plus(new Prisma.Decimal(row.balance)));
  }
  const byCurrency: CashPositionByCurrency[] = [...currencyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => ({ currency, totalBalance: serializeMoneyDecimal(total) }));

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
      .map(([currency, total]) => ({ currency, totalBalance: serializeMoneyDecimal(total) })),
  }));

  const totalArs = consolidateCashPositionArs(amounts);
  const consolidatedArs = totalArs === null ? null : serializeMoneyDecimal(totalArs);
  return { accounts: accountRows, byCurrency, byCompany, consolidatedArs };
}

type RawMovementRow = {
  id: string;
  accountId: string;
  movementDate: Date;
  valueDate: Date | null;
  createdAt: Date;
  type: string;
  status: string;
  sourceType: string;
  sourceId: string;
  amount: Prisma.Decimal;
  fxRate: Prisma.Decimal | null;
  amountArs: Prisma.Decimal | null;
  currency: string;
  description: string;
  transferId: string | null;
  projectId: string | null;
  counterpartyContactId: string | null;
  externalInvoiceRef: string | null;
  account: { name: string };
  counterparty: { fantasyName: string | null; legalName: string; tenantId: string } | null;
};

async function resolveMovementCashMeta(
  rawRows: RawMovementRow[],
  tenantId: string,
): Promise<{
  projectIdByMovement: Map<string, string | null>;
  documentRefByMovement: Map<string, string | null>;
}> {
  const projectIdByMovement = new Map<string, string | null>();
  const documentRefByMovement = new Map<string, string | null>();

  for (const m of rawRows) {
    projectIdByMovement.set(m.id, m.projectId);
    documentRefByMovement.set(m.id, null);
  }

  const paymentIds = rawRows
    .filter((m) => m.sourceType === "PAYMENT" && m.sourceId)
    .map((m) => m.sourceId);
  const collectionIds = rawRows
    .filter((m) => m.sourceType === "COLLECTION" && m.sourceId)
    .map((m) => m.sourceId);

  if (paymentIds.length === 0 && collectionIds.length === 0) {
    return { projectIdByMovement, documentRefByMovement };
  }

  const { documentRefs, projects } = await loadCashSourceMeta(
    tenantId,
    paymentIds,
    collectionIds,
  );

  for (const m of rawRows) {
    documentRefByMovement.set(
      m.id,
      documentRefForCashSource(m.sourceType, m.sourceId, documentRefs),
    );
    if (m.projectId !== null) continue;
    if (m.sourceType === "PAYMENT") {
      projectIdByMovement.set(m.id, projects.byPaymentId.get(m.sourceId) ?? null);
    } else if (m.sourceType === "COLLECTION") {
      projectIdByMovement.set(m.id, projects.byCollectionId.get(m.sourceId) ?? null);
    }
  }

  return { projectIdByMovement, documentRefByMovement };
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
  mode?: "export",
): Promise<MovementReportResult> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos");
  }
  for (const [id, label] of [[filters.accountId, "Cuenta inválida"], [filters.companyId, "Empresa inválida"], [filters.projectId, "Proyecto inválido"]] as const) {
    if (id && !isUuid(id)) throw new ServiceError("VALIDATION", label);
  }
  if (filters.type && !Object.values(AccountMovementType).includes(filters.type as AccountMovementType)) {
    throw new ServiceError("VALIDATION", "Tipo de movimiento inválido");
  }
  if (filters.sourceType && !Object.values(AccountMovementSourceType).includes(filters.sourceType as AccountMovementSourceType)) {
    throw new ServiceError("VALIDATION", "Origen de movimiento inválido");
  }

  const exporting = mode === "export";
  const paginated = !exporting && (filters.page !== undefined || filters.pageSize !== undefined);
  const byValue = filters.dateBasis === "value";
  if (byValue && (paginated || !filters.accountId)) {
    throw new ServiceError("VALIDATION", "Elegí una cuenta para consultar el extracto por fecha valor.");
  }
  const { skip, take } = resolvePagination(
    paginated ? { page: filters.page, pageSize: filters.pageSize } : undefined,
  );

  let dateFrom = cashReportDate(filters.dateFrom);
  let dateTo = cashReportDate(filters.dateTo);
  if (exporting && !filters.accountId && (!dateFrom || !dateTo)) {
    throw new ServiceError("VALIDATION", "Exportar movimientos requiere fechas válidas cuando no hay una cuenta seleccionada.");
  }
  if (paginated && (!dateFrom || !dateTo)) {
    const defaults = defaultDateRangeDays(DEFAULT_CASH_DATE_RANGE_DAYS);
    dateFrom = dateFrom ?? defaults.dateFrom;
    dateTo = dateTo ?? defaults.dateTo;
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ServiceError("VALIDATION", "La fecha desde no puede ser posterior a la fecha hasta.");
  }

  // Tesorería es tenant-wide: sólo acota un filtro de empresa explícito (URL), no ctx.companyId.
  const companyId = filters.companyId ?? undefined;

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
    const acc = await prisma.treasuryAccount.findFirst({
      where: { ...treasuryReportAccountScope(ctx.tenantId), id: filters.accountId },
      select: { id: true },
    });
    if (!acc) {
      throw new ServiceError("FORBIDDEN", "Cuenta no encontrada o sin acceso");
    }
  }

  const projectWhere = await movementProjectWhere(filters, ctx.tenantId);
  const classCode = parseMovementClassFilter(filters.class);
  const range = dateFrom || dateTo ? {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(dateTo) } : {}),
  } : undefined;

  const where: Prisma.AccountMovementWhereInput = {
    tenantId: ctx.tenantId,
    status: { in: [...BALANCE_AFFECTING_MOVEMENT_STATUSES] },
    account: treasuryReportAccountScope(ctx.tenantId, companyId),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.currency ? { currency: filters.currency } : {}),
    ...(filters.type ? { type: filters.type as never } : {}),
    ...(filters.sourceType ? { sourceType: filters.sourceType as never } : {}),
    ...(filters.includeInternalTransfers === false ? { transferId: null } : {}),
    AND: [
      projectWhere,
      ...(range ? [byValue
        ? { OR: [{ valueDate: range }, { valueDate: null, movementDate: range }] }
        : { movementDate: range }] : []),
      ...(classCode ? [accountMovementClassWhere(classCode)] : []),
      ...(filters.corporateApPaymentsOnly ? [{ sourceType: "PAYMENT" as const, sourceId: { in: corporatePaymentIds! } }] : []),
    ],
  };

  const needsRunningBalance = !paginated && Boolean(filters.accountId) &&
    !filters.type && !filters.sourceType && !filters.currency && !filters.class &&
    !filters.projectId && !filters.projectOnly && !filters.corporateOnly &&
    !filters.corporateApPaymentsOnly && filters.includeInternalTransfers !== false;
  // Explicit URL dir wins; otherwise: running-balance extracts stay chronological (asc),
  // paginated ledgers default to recent-first (desc).
  const dateDir: "asc" | "desc" =
    filters.sortDir === "asc" || filters.sortDir === "desc"
      ? filters.sortDir
      : needsRunningBalance
        ? "asc"
        : "desc";
  // Running balance must be accumulated chronologically; reverse after map if UI wants desc.
  const fetchDir = needsRunningBalance ? "asc" : dateDir;
  const orderBy = paginated
    ? ([{ movementDate: fetchDir }, { id: fetchDir }] as const)
    : needsRunningBalance
      ? ([{ movementDate: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }] as const)
      : ([{ movementDate: fetchDir }, { id: fetchDir }] as const);

  const [rawRows, total] = await Promise.all([
    prisma.accountMovement.findMany({
      where,
      include: {
        account: { select: { name: true } },
        counterparty: { select: { fantasyName: true, legalName: true, tenantId: true } },
      },
      orderBy: [...orderBy],
      ...(exporting ? { take: MAX_EXPORT_ROWS } : paginated ? { skip, take } : {}),
    }),
    paginated || exporting ? prisma.accountMovement.count({ where }) : Promise.resolve(0),
  ]);

  const effectiveDate = (movement: RawMovementRow) => byValue ? movement.valueDate ?? movement.movementDate : movement.movementDate;
  const typedRawRows = rawRows as RawMovementRow[];
  if (byValue) {
    const sign = fetchDir === "asc" ? 1 : -1;
    typedRawRows.sort((left, right) => sign * (
      effectiveDate(left).getTime() - effectiveDate(right).getTime() ||
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    ));
  }

  let runningBalance: Prisma.Decimal | undefined;
  if (needsRunningBalance && typedRawRows[0]) {
    // Seed = balance *before* the first row in the result set.
    runningBalance = await getAccountBalanceAsOf(filters.accountId!, {
      beforeDate: dateFrom ? new Date(dateFrom) : effectiveDate(typedRawRows[0]),
      dateBasis: byValue ? "value" : "accounting",
    });
  }

  const { projectIdByMovement, documentRefByMovement } = await resolveMovementCashMeta(
    typedRawRows,
    ctx.tenantId,
  );
  const uniqueProjectIds = [
    ...new Set(
      [...projectIdByMovement.values()].filter((id): id is string => id !== null),
    ),
  ];
  const projectNames = await loadProjectNames(ctx.tenantId, uniqueProjectIds);

  let rows: MovementReportRow[] = typedRawRows.map((m) => {
    // Same sign convention as balance.service (INFLOW/TRANSFER_IN +, else −).
    const signed = signedTreasuryAmount(m.type as string, m.amount);
    if (runningBalance !== undefined) {
      runningBalance = runningBalance.plus(signed);
    }
    const resolvedProjectId = projectIdByMovement.get(m.id) ?? null;
    const documentRef = documentRefByMovement.get(m.id) ?? null;
    const counterpartyName = m.counterparty?.tenantId === ctx.tenantId
      ? (m.counterparty.fantasyName ?? m.counterparty.legalName)
      : null;
    const sourceType = m.sourceType as string;
    const currency = cashPositionCurrency(m.currency);
    const classFields = classFieldsForAccountMovement({
      type: m.type as string,
      sourceType,
    });
    return {
      id: m.id,
      accountId: m.accountId,
      accountName: m.account.name,
      movementDate: m.movementDate.toISOString().slice(0, 10),
      valueDate: m.valueDate?.toISOString().slice(0, 10) ?? null,
      type: m.type as string,
      status: m.status as string,
      sourceType,
      sourceId: m.sourceId,
      sourceLabel: movementSourceLabel(
        sourceType,
        counterpartyName,
        m.externalInvoiceRef,
      ),
      amount: serializeMoneyDecimal(m.amount),
      signedAmount: serializeMoneyDecimal(signed),
      currency,
      fxRate: m.fxRate?.gt(0) ? serializeFxRateDecimal(m.fxRate) : null,
      amountArs: currency === "ARS" ? serializeMoneyDecimal(m.amount) : m.fxRate?.gt(0) && m.amountArs ? serializeMoneyDecimal(m.amountArs) : null,
      description: displayMovementDescription(m.description, sourceType, documentRef),
      detailHref: resolveMovementDetailHref({
        sourceType,
        sourceId: m.sourceId,
        projectId: resolvedProjectId,
        accountId: m.accountId,
        transferId: m.transferId,
      }),
      transferId: m.transferId,
      isInternalTransfer: m.transferId !== null,
      projectId: resolvedProjectId,
      projectName: resolvedProjectId ? (projectNames.get(resolvedProjectId) ?? null) : null,
      counterpartyName,
      documentRef,
      externalInvoiceRef: m.externalInvoiceRef,
      ...(runningBalance !== undefined ? { runningBalance: serializeMoneyDecimal(runningBalance) } : {}),
      ...classFields,
    };
  });

  if (needsRunningBalance && dateDir === "desc") {
    rows = rows.slice().reverse();
  }

  return { rows, total: paginated || exporting ? total : rows.length };
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

  const { dateFrom, dateTo } = getCashFlowDateRange(filters);
  if (dateFrom > dateTo) {
    throw new ServiceError("VALIDATION", "La fecha desde no puede ser posterior a la fecha hasta.");
  }
  const period   = filters.period ?? "month";
  const startDate = new Date(dateFrom);
  const endDate   = new Date(dateTo);
  const currencyFilter = filters.currency ? cashPositionCurrency(filters.currency) : undefined;
  const allAccounts = (await prisma.treasuryAccount.findMany({
    where: treasuryReportAccountScope(ctx.tenantId),
    select: { currency: true, id: true, openingBalance: true },
  }))
    .map((account) => ({ ...account, currency: cashPositionCurrency(account.currency) }))
    .filter((account) => !currencyFilter || account.currency === currencyFilter);
  const currencyByAccount = new Map(allAccounts.map((account) => [account.id, account.currency]));

  const movements = await prisma.accountMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { in: [...BALANCE_AFFECTING_MOVEMENT_STATUSES] },
      account: treasuryReportAccountScope(ctx.tenantId),
      accountId: { in: [...currencyByAccount.keys()] },
      movementDate: { gte: startDate, lte: endDate },
    },
    select: { type: true, amount: true, currency: true, movementDate: true, accountId: true },
    orderBy: { movementDate: "asc" },
  });

  const movementsByCurrency = new Map<string, typeof movements>();
  for (const movement of movements) {
    const currency = cashPositionCurrency(movement.currency);
    if (currencyByAccount.get(movement.accountId) !== currency) {
      throw new ServiceError("CONFLICT", "Hay movimientos en moneda distinta a la de su cuenta. Revisá el extracto antes de calcular el flujo.");
    }
    const rows = movementsByCurrency.get(currency) ?? [];
    rows.push(movement);
    movementsByCurrency.set(currency, rows);
  }

  const balances = await getAccountBalancesForAccounts(allAccounts, ctx.tenantId, { beforeDate: startDate });
  const openingByCurrency = new Map<string, Prisma.Decimal>();
  for (const { id, currency } of allAccounts) {
    const total = openingByCurrency.get(currency) ?? new Prisma.Decimal(0);
    openingByCurrency.set(currency, total.plus(balances.get(id)!));
  }

  const result: CashFlowReport = [];

  for (const currency of [...openingByCurrency.keys()].sort()) {
    const openingBalance = openingByCurrency.get(currency)!;

    // Bucket movements in range
    type BucketAcc = {
      inflow: Prisma.Decimal; outflow: Prisma.Decimal;
      internalTransferIn: Prisma.Decimal; internalTransferOut: Prisma.Decimal;
      adjustments: Prisma.Decimal;
    };
    const bucketMap = new Map<string, BucketAcc>();

    for (const m of movementsByCurrency.get(currency) ?? []) {
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
      const netAll = netOp.plus(b.internalTransferIn).minus(b.internalTransferOut).plus(signedTreasuryAmount("ADJUSTMENT", b.adjustments));
      running = running.plus(netAll);
      return {
        period:               key,
        inflow:               serializeMoneyDecimal(b.inflow),
        outflow:              serializeMoneyDecimal(b.outflow),
        internalTransferIn:   serializeMoneyDecimal(b.internalTransferIn),
        internalTransferOut:  serializeMoneyDecimal(b.internalTransferOut),
        adjustments:          serializeMoneyDecimal(b.adjustments),
        netOperatingCashFlow: serializeMoneyDecimal(netOp),
        netCashFlow:          serializeMoneyDecimal(netAll),
      };
    });

    result.push({
      currency,
      openingBalance: serializeMoneyDecimal(openingBalance),
      closingBalance: serializeMoneyDecimal(running),
      buckets,
    });
  }

  return result;
}
