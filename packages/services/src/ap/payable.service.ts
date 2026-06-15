import { prisma, Payable, Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { auditAp } from "./ap-audit";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { appendPayableStatusFilter, appendPendingPayablesFilter } from "../finance/payable-list-filters";
import { deriveObligationDisplayStatus, hasOpenObligationBalance, isObligationOverdue, OBLIGATION_OPEN_BALANCE_EPSILON } from "../finance/obligation-date";
import {
  aggregateCorporatePayableBalances,
  fetchCorporatePayableSnapshotRows,
} from "./corporate-ap-snapshot";
import { assertCanCancelPayableDirect } from "./payable-cancel-guards";
import { canViewApProjectArea, canViewCompanyAp } from "./ap-access";

// ─── View type ────────────────────────────────────────────────────────────────

export type PayableView = Omit<Payable, "originalAmount" | "paidAmount"> & {
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  supplierName: string;
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
    include: { supplierContact: { select: { legalName: true, fantasyName: true } } },
  });
  if (!p) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && p.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a este proyecto");
  }
  const reconciled = await reconcilePayableStatusIfSettled(p, ctx);
  return serializePayable({ ...p, ...reconciled });
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
    include: { supplierContact: { select: { legalName: true, fantasyName: true } } },
  });
  if (!p) return null;
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && p.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a este proyecto");
  }
  const reconciled = await reconcilePayableStatusIfSettled(p, ctx);
  return serializePayable({ ...p, ...reconciled });
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
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where = { projectId, tenantId: ctx.tenantId };

  const [rows, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      include: { supplierContact: { select: { legalName: true, fantasyName: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.payable.count({ where }),
  ]);
  const reconciled = await Promise.all(rows.map((r) => reconcilePayableStatusIfSettled(r, ctx)));
  return {
    data: reconciled.map((p, i) => serializePayable({ ...rows[i]!, ...p })),
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
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const rows = await prisma.payable.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    select: {
      currency: true,
      originalAmount: true,
      paidAmount: true,
      dueDate: true,
      status: true,
    },
  });

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
    dueDate: Date;
    status: string;
  }>,
): PayablesProjectSummary {
  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();
  const zero = new Prisma.Decimal(0);

  for (const p of rows) {
    if (p.status === "CANCELLED") continue;
    const bal = p.originalAmount.minus(p.paidAmount);
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
      .map(([currency, amount]) => ({ currency, amount: amount.toString() }))
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

  const where: Prisma.PayableWhereInput = {
    tenantId: ctx.tenantId,
    projectId: null,
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
  };
  if (filters?.pendingOnly && !filters.status) {
    appendPendingPayablesFilter(where);
  }
  appendPayableStatusFilter(where, filters?.status);

  const [rows, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      include: {
        supplierContact: { select: { legalName: true, fantasyName: true } },
        supplierInvoice: { select: { number: true } },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.payable.count({ where }),
  ]);

  const reconciled = await Promise.all(rows.map((r) => reconcilePayableStatusIfSettled(r, ctx)));
  const data: CompanyPayableListRow[] = reconciled.map((p, i) => {
    const row = rows[i]!;
    const { supplierInvoice, ...payableWithContact } = row;
    const base = serializePayable({ ...payableWithContact, ...p });
    const num = supplierInvoice?.number;
    return {
      ...base,
      supplierInvoiceCode: num != null ? `FP-${String(num).padStart(5, "0")}` : null,
    };
  });

  return { data, total };
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
    include: { supplierContact: { select: { legalName: true, fantasyName: true } } },
  });
  if (!p) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (p.projectId !== null) {
    throw new ServiceError("FORBIDDEN", "Esta cuenta está asignada a un proyecto; usá el espacio de trabajo del proyecto");
  }
  if (ctx.companyId && p.companyId !== ctx.companyId) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
  const reconciled = await reconcilePayableStatusIfSettled(p, ctx);
  return serializePayable({ ...p, ...reconciled });
}

export async function cancelPayable(id: string, ctx: ServiceContext): Promise<Payable> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cuentas por pagar");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payable.findUnique({ where: { id } });
    if (!row) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
    if (row.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (row.status === "CANCELLED") throw new ServiceError("CONFLICT", "La cuenta ya está cancelada");

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
    });

    const payableCancel = await tx.payable.updateMany({
      where: { id, status: { not: "CANCELLED" }, paidAmount: row.paidAmount },
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
      { after: { status: "CANCELLED", number: supplierInvoice?.number ?? null }, tx },
    );

    return updated;
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

async function reconcilePayableStatusIfSettled(
  payable: Payable,
  ctx: ServiceContext,
): Promise<Payable> {
  if (payable.status === "PAID" || payable.status === "CANCELLED") return payable;
  const balanceDue = payable.originalAmount.minus(payable.paidAmount);
  if (balanceDue.greaterThan(0)) return payable;

  const updated = await prisma.payable.updateMany({
    where: {
      id: payable.id,
      tenantId: ctx.tenantId,
      status: { notIn: ["PAID", "CANCELLED"] },
      paidAmount: payable.paidAmount,
      originalAmount: payable.originalAmount,
    },
    data: { status: "PAID", updatedBy: ctx.actorUserId },
  });
  if (updated.count === 0) return payable;
  return { ...payable, status: "PAID" };
}

type RawPayable = Payable & {
  supplierContact: { legalName: string; fantasyName: string | null };
};

export function serializePayable(p: RawPayable): PayableView {
  const balanceDue = p.originalAmount.minus(p.paidAmount);
  const status = deriveObligationDisplayStatus(p.status, balanceDue, p.dueDate, undefined, p.paidAmount);
  return {
    ...p,
    status,
    originalAmount: p.originalAmount.toString(),
    paidAmount:     p.paidAmount.toString(),
    balanceDue:     balanceDue.toString(),
    supplierName:   p.supplierContact.fantasyName ?? p.supplierContact.legalName,
  };
}
