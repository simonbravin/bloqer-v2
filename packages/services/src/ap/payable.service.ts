import { prisma, Payable, Prisma } from "@bloqer/database";
import { auditAp } from "./ap-audit";
import { requireApCancellationReason } from "./ap-input";
import { apInvoiceParents, apPayableParents, assertApPayableReadParents, assertApTransactionModules, stripApParents } from "./ap-integrity";
import { lockProjectForMutation } from "../project/project-write-lock";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { appendPayableStatusFilter, appendPendingPayablesFilter } from "../finance/payable-list-filters";
import { deriveObligationDisplayStatus, hasOpenObligationBalance, isObligationOverdue, OBLIGATION_OPEN_BALANCE_EPSILON } from "../finance/obligation-date";
import {
  computeObligationBalanceDue,
  normalizeObligationBalanceDue,
} from "../finance/obligation-balance";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { requireProjectAccess, requireProjectAccessIfPresent } from "../security/access";
import {
  aggregateCorporatePayableBalances,
  fetchCorporatePayableSnapshotRows,
} from "./corporate-ap-snapshot";
import { assertCanCancelPayableDirect } from "./payable-cancel-guards";
import { canMutateApForScope, canViewApProjectArea, canViewCompanyAp } from "./ap-access";
import {
  formatSupplierInvoiceCode,
  PAYABLES_FIELD_FETCH_LIMIT,
  utcIsoDate,
  type PayablesFieldRow,
} from "./payables-field";
import {
  classFieldsForSupplierInvoice,
  type FinancialClassFields,
} from "../finance/document-class.service";

// ─── View type ────────────────────────────────────────────────────────────────

export type PayableView = Omit<Payable, "originalAmount" | "paidAmount" | "creditedAmount"> & {
  originalAmount: string;
  paidAmount: string;
  creditedAmount: string;
  balanceDue: string;
  supplierName: string;
  supplierInvoiceCode: string | null;
} & FinancialClassFields;

const payableReadInclude = {
  ...apPayableParents,
  supplierInvoice: { include: { ...apInvoiceParents,
    lines: { where: { purchaseOrderLineId: { not: null } }, select: { id: true }, take: 1 },
  } },
} as const satisfies Prisma.PayableInclude;

type PayableInvoiceClassSelect = {
  number?: number;
  documentKind?: string;
  projectId: string | null;
  purchaseOrderId: string | null;
  subcontractCertificationId: string | null;
  lines: Array<{ id: string }>;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPayableById(
  id: string,
  ctx: ServiceContext,
  /** When set (project workspace routes), corporate payables and cross-project IDs are rejected. */
  projectScopeId?: string,
): Promise<PayableView> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar");
  }
  const p = await prisma.payable.findUnique({
    where: { id },
    include: payableReadInclude,
  });
  if (!p) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(p.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a la empresa activa");
  }
  if (p.projectId === null && !canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
  }
  if (projectScopeId !== undefined && p.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a este proyecto");
  }
  await requireProjectAccessIfPresent(p.projectId, ctx);
  assertApPayableReadParents(p, ctx);
  const reconciled = p;
  const { supplierInvoice, ...rest } = { ...p, ...reconciled };
  return serializePayable({
    ...rest,
    supplierInvoice,
  });
}

export async function getPayableBySupplierInvoiceId(
  supplierInvoiceId: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<PayableView | null> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar");
  }
  const p = await prisma.payable.findUnique({
    where: { supplierInvoiceId },
    include: payableReadInclude,
  });
  if (!p) return null;
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(p.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a la empresa activa");
  }
  if (p.projectId === null && !canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
  }
  if (projectScopeId !== undefined && p.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a este proyecto");
  }
  await requireProjectAccessIfPresent(p.projectId, ctx);
  assertApPayableReadParents(p, ctx);
  const reconciled = p;
  const { supplierInvoice, ...rest } = { ...p, ...reconciled };
  return serializePayable({ ...rest, supplierInvoice });
}

export type ProjectPayableListFilters = {
  page?: number;
  pageSize?: number;
};

export async function listPayablesByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectPayableListFilters,
): Promise<{ data: PayableView[]; total: number }> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar");
  }
  await requireProjectAccess(projectId, ctx);

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where = { projectId, tenantId: ctx.tenantId };

  const [rows, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      include: payableReadInclude,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.payable.count({ where }),
  ]);
  rows.forEach(row => assertApPayableReadParents(row, ctx));
  const reconciled = rows;
  return {
    data: reconciled.map((p, i) => {
      const row = rows[i]!;
      const { supplierInvoice, ...rest } = { ...row, ...p };
      return serializePayable({ ...rest, supplierInvoice });
    }),
    total,
  };
}

export type PayablesProjectSummary = {
  totalByCurrency: { currency: string; amount: string }[];
  overdueByCurrency: { currency: string; amount: string }[];
};

/** Lightweight aggregation for project finance overview (no full list). */
export async function summarizePayablesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PayablesProjectSummary> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar");
  }
  await requireProjectAccess(projectId, ctx);

  const rows = await prisma.payable.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: apPayableParents,
  });

  rows.forEach(row => assertApPayableReadParents(row, ctx));

  return aggregateOpenPayableBalances(rows);
}

/** Lightweight aggregation for corporate AP (projectId null). */
export async function summarizeCompanyPayables(
  ctx: ServiceContext,
): Promise<PayablesProjectSummary> {
  const rows = await fetchCorporatePayableSnapshotRows(ctx);
  return aggregateCorporatePayableBalances(rows);
}

function aggregateOpenPayableBalances(
  rows: Array<{
    currency: string;
    originalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    creditedAmount: Prisma.Decimal;
    dueDate: Date;
    status: string;
  }>,
): PayablesProjectSummary {
  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();
  const zero = new Prisma.Decimal(0);

  for (const p of rows) {
    if (p.status === "CANCELLED") continue;
    const bal = computeObligationBalanceDue(p.originalAmount, p.paidAmount, p.creditedAmount);
    if (!hasOpenObligationBalance(bal, OBLIGATION_OPEN_BALANCE_EPSILON)) continue;
    const cur = p.currency;
    total.set(cur, (total.get(cur) ?? zero).add(bal));
    if (isObligationOverdue(p.dueDate)) {
      overdue.set(cur, (overdue.get(cur) ?? zero).add(bal));
    }
  }

  const toRows = (m: Map<string, Prisma.Decimal>) =>
    [...m.entries()]
      .filter(([, v]) => hasOpenObligationBalance(v, OBLIGATION_OPEN_BALANCE_EPSILON))
      .map(([currency, amount]) => ({ currency, amount: serializeMoneyDecimal(amount) }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

  return { totalByCurrency: toRows(total), overdueByCurrency: toRows(overdue) };
}

export type CompanyPayableListFilters = {
  status?:            "OPEN" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
  /** When true and no explicit status, excludes PAID/CANCELLED (pending obligations). */
  pendingOnly?:       boolean;
  supplierContactId?: string;
  dueDateFrom?:       string;
  dueDateTo?:         string;
  search?:            string;
  sortDir?:           "asc" | "desc";
  page?:              number;
  pageSize?:          number;
};

export type CompanyPayableListRow = PayableView & {
  /** `FP-00001` style; null if invoice row missing (should not happen). */
  supplierInvoiceCode: string | null;
};

/** Payables with no project. Requires VIEW AP only. */
export async function listCompanyPayables(
  ctx: ServiceContext,
  filters?: CompanyPayableListFilters,
): Promise<{ data: CompanyPayableListRow[]; total: number }> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
  }

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const search = filters?.search?.trim();
  const where: Prisma.PayableWhereInput = {
    tenantId: ctx.tenantId,
    projectId: null,
    // Payable.companyId es NOT NULL → scope directo por empresa.
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(filters?.supplierContactId ? { supplierContactId: filters.supplierContactId } : {}),
    ...(filters?.dueDateFrom || filters?.dueDateTo
      ? {
          dueDate: {
            ...(filters.dueDateFrom ? { gte: new Date(filters.dueDateFrom) } : {}),
            ...(filters.dueDateTo ? { lte: new Date(filters.dueDateTo) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { supplierContact: { legalName: { contains: search, mode: "insensitive" } } },
            { supplierContact: { fantasyName: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  if (filters?.pendingOnly && !filters.status) {
    appendPendingPayablesFilter(where);
  }
  appendPayableStatusFilter(where, filters?.status);

  const dueDir = filters?.sortDir === "desc" ? "desc" : "asc";

  const [rows, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      include: payableReadInclude,
      orderBy: [{ dueDate: dueDir }, { id: dueDir }],
      skip,
      take,
    }),
    prisma.payable.count({ where }),
  ]);

  rows.forEach(row => assertApPayableReadParents(row, ctx));
  const reconciled = rows;
  const data: CompanyPayableListRow[] = reconciled.map((p, i) => {
    const row = rows[i]!;
    const { supplierInvoice, ...payableWithContact } = row;
    const { number, ...invoiceClass } = supplierInvoice ?? {
      number: undefined as number | undefined,
      projectId: null,
      purchaseOrderId: null,
      subcontractCertificationId: null,
      lines: [] as Array<{ id: string }>,
    };
    const base = serializePayable({
      ...payableWithContact,
      ...p,
      supplierInvoice: invoiceClass,
    });
    return {
      ...base,
      supplierInvoiceCode: number != null ? `${supplierInvoice?.documentKind === "DEBIT_NOTE" ? "ND" : "FP"}-${String(number).padStart(5, "0")}` : null,
    };
  });

  return { data, total };
}

export type PayablesFieldBoardResult = {
  rows: PayablesFieldRow[];
  total: number;
  truncatedFetch: boolean;
};

/**
 * Lightweight Field list: payables only (invoice number + optional project name).
 * Skips aging and related invoices/payments. Not a second payment engine.
 */
export async function listPayablesFieldBoard(
  ctx: ServiceContext,
  scope: { projectId: string } | { companyOnly: true },
): Promise<PayablesFieldBoardResult> {
  await assertApTenantModule(ctx);

  const where: Prisma.PayableWhereInput = { tenantId: ctx.tenantId };

  if ("projectId" in scope) {
    if (!canViewApProjectArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar");
    }
    await requireProjectAccess(scope.projectId, ctx);
    where.projectId = scope.projectId;
  } else {
    if (!canViewCompanyAp(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
    }
    where.projectId = null;
    if (ctx.companyId) where.companyId = ctx.companyId;
  }

  const [rows, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      include: payableReadInclude,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: PAYABLES_FIELD_FETCH_LIMIT,
    }),
    prisma.payable.count({ where }),
  ]);

  rows.forEach(row => assertApPayableReadParents(row, ctx));
  const reconciled = rows;
  const mapped: PayablesFieldRow[] = reconciled.map((p, i) => {
    const row = rows[i]!;
    const { supplierInvoice, project, ...payableWithContact } = row;
    const { number, ...invoiceClass } = supplierInvoice ?? {
      number: null,
      projectId: null,
      purchaseOrderId: null,
      subcontractCertificationId: null,
      lines: [],
    };
    const base = serializePayable({
      ...payableWithContact,
      ...p,
      supplierInvoice: invoiceClass,
    });
    return {
      id: base.id,
      supplierName: base.supplierName,
      supplierInvoiceId: base.supplierInvoiceId,
      supplierInvoiceCode: number != null ? `${supplierInvoice?.documentKind === "DEBIT_NOTE" ? "ND" : "FP"}-${String(number).padStart(5, "0")}` : formatSupplierInvoiceCode(number),
      projectId: base.projectId,
      projectName: project?.name ?? null,
      issueDateIso: utcIsoDate(base.issueDate),
      dueDateIso: utcIsoDate(base.dueDate),
      currency: base.currency,
      originalAmount: base.originalAmount,
      paidAmount: base.paidAmount,
      balanceDue: base.balanceDue,
      status: base.status,
    };
  });

  return {
    rows: mapped,
    total,
    truncatedFetch: total > PAYABLES_FIELD_FETCH_LIMIT,
  };
}

/**
 * Corporate payable: `projectId === null`. VIEW AP only.
 */
export async function getCompanyPayableById(id: string, ctx: ServiceContext): Promise<PayableView> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
  }
  const p = await prisma.payable.findUnique({
    where: { id },
    include: payableReadInclude,
  });
  if (!p) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (p.projectId !== null) {
    throw new ServiceError("FORBIDDEN", "Esta cuenta está asignada a un proyecto; usá el espacio de trabajo del proyecto");
  }
  if (isCrossCompany(p.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
  assertApPayableReadParents(p, ctx);
  const reconciled = p;
  const { supplierInvoice, ...rest } = { ...p, ...reconciled };
  return serializePayable({ ...rest, supplierInvoice });
}

export async function cancelPayable(id: string, ctx: ServiceContext, projectScopeId?: string, reason?: string): Promise<Payable> {
  await assertApTenantModule(ctx);

  const preview = await prisma.payable.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!preview) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
  if (preview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(preview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
  if (!canMutateApForScope(ctx.roles, preview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cuentas por pagar");
  }
  if (projectScopeId !== undefined && preview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a este proyecto");
  }
  await requireProjectAccessIfPresent(preview.projectId, ctx);

  const updated = await prisma.$transaction(async (tx) => {
    if (preview.projectId) await lockProjectForMutation(tx, preview.projectId, ctx.tenantId);
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${preview.companyId} AND "tenantId" = ${ctx.tenantId} FOR NO KEY UPDATE`;
    await assertApTransactionModules(tx, ctx);
    const row = await tx.payable.findUnique({ where: { id } });
    if (!row) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
    if (row.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (row.status === "CANCELLED") return row;
    const cancellationReason = requireApCancellationReason("ISSUED", reason);

    const supplierInvoice = await tx.supplierInvoice.findUnique({
      where: { id: row.supplierInvoiceId },
      select: { status: true, number: true },
    });
    const activePayments = await tx.payment.count({
      where: { payableId: id, status: "CONFIRMED", tenantId: ctx.tenantId },
    });
    assertCanCancelPayableDirect({
      supplierInvoiceStatus: supplierInvoice?.status,
      activePaymentCount: activePayments,
      paidAmount: row.paidAmount,
      creditedAmount: row.creditedAmount,
    });

    const payableCancel = await tx.payable.updateMany({
      where: { id, tenantId: ctx.tenantId, status: { not: "CANCELLED" }, paidAmount: row.paidAmount, creditedAmount: row.creditedAmount },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      payableCancel.count,
      "El saldo cambió mientras cancelabas la cuenta. Revisá pagos e intentá de nuevo.",
    );
    const updated = await tx.payable.findUniqueOrThrow({ where: { id } });

    await auditAp(
      ctx,
      "payable.cancelled",
      "Payable",
      id,
      { projectId: updated.projectId, companyId: updated.companyId },
      { after: { status: "CANCELLED", number: supplierInvoice?.number ?? null, cancellationReason }, tx },
    );

    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────



type RawPayable = Payable & {
  supplierContact: { legalName: string; fantasyName: string | null };
  supplierInvoice?: PayableInvoiceClassSelect | null;
};

export function serializePayable(p: RawPayable): PayableView {
  const rawBalance = computeObligationBalanceDue(p.originalAmount, p.paidAmount, p.creditedAmount);
  const balanceDue = normalizeObligationBalanceDue(rawBalance);
  const status = deriveObligationDisplayStatus(p.status, rawBalance, p.dueDate, undefined, p.paidAmount, p.creditedAmount);
  const inv = p.supplierInvoice;
  const classFields = classFieldsForSupplierInvoice({
    projectId: inv?.projectId ?? p.projectId,
    purchaseOrderId: inv?.purchaseOrderId,
    hasPoLineLink: (inv?.lines.length ?? 0) > 0,
    subcontractCertificationId: inv?.subcontractCertificationId,
  });
  return {
    ...stripApParents(p),
    status,
    originalAmount: serializeMoneyDecimal(p.originalAmount),
    paidAmount:     serializeMoneyDecimal(p.paidAmount),
    creditedAmount: serializeMoneyDecimal(p.creditedAmount),
    balanceDue:     serializeMoneyDecimal(balanceDue),
    supplierName:   p.supplierContact.fantasyName ?? p.supplierContact.legalName,
    supplierInvoiceCode: inv?.number != null ? `${inv.documentKind === "DEBIT_NOTE" ? "ND" : "FP"}-${String(inv.number).padStart(5, "0")}` : null,
    ...classFields,
  };
}
