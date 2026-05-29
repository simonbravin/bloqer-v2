import { Prisma, prisma, Receivable, ReceivableStatus } from "@bloqer/database";
import { canEditArArea, canViewArProjectArea } from "./ar-access";
import { auditAr } from "./ar-audit";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { assertCanCancelReceivableDirect } from "./receivable-cancel-guards";

const MAX_COLLECTIBLE_RECEIVABLES = 500;

// ─── View type ────────────────────────────────────────────────────────────────

export type ReceivableView = Omit<Receivable, "originalAmount" | "paidAmount"> & {
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  clientName: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getReceivableById(id: string, ctx: ServiceContext): Promise<ReceivableView> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  const r = await prisma.receivable.findUnique({
    where: { id },
    include: { clientContact: { select: { legalName: true, fantasyName: true } } },
  });
  if (!r) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeReceivable(r);
}

export type ProjectReceivableListFilters = {
  page?: number;
  pageSize?: number;
};

export async function listReceivablesByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectReceivableListFilters,
): Promise<{ data: ReceivableView[]; total: number }> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
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
    prisma.receivable.findMany({
      where,
      include: { clientContact: { select: { legalName: true, fantasyName: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.receivable.count({ where }),
  ]);
  return { data: rows.map(serializeReceivable), total };
}

/** Open/partial receivables for collection picker (capped, no pagination). */
export async function listCollectibleReceivablesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<ReceivableView[]> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const rows = await prisma.receivable.findMany({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      status: { in: [...ACTIVE_OBLIGATION_STATUSES] },
    },
    include: { clientContact: { select: { legalName: true, fantasyName: true } } },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: MAX_COLLECTIBLE_RECEIVABLES,
  });

  return rows
    .map(serializeReceivable)
    .filter((r) => new Prisma.Decimal(r.balanceDue).greaterThan(0));
}



export type ReceivablesProjectSummary = {
  totalByCurrency: { currency: string; amount: string }[];
  overdueByCurrency: { currency: string; amount: string }[];
};

/** Lightweight aggregation for project finance overview (no full list). */
export async function summarizeReceivablesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<ReceivablesProjectSummary> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const rows = await prisma.receivable.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    select: {
      currency: true,
      originalAmount: true,
      paidAmount: true,
      dueDate: true,
      status: true,
    },
  });

  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();
  const zero = new Prisma.Decimal(0);

  for (const r of rows) {
    if (r.status === "PAID" || r.status === "CANCELLED") continue;
    const bal = r.originalAmount.minus(r.paidAmount);
    if (bal.lessThanOrEqualTo(0)) continue;
    const cur = r.currency;
    total.set(cur, (total.get(cur) ?? zero).add(bal));
    if (isObligationOverdue(r.dueDate)) {
      overdue.set(cur, (overdue.get(cur) ?? zero).add(bal));
    }
  }

  const toRows = (m: Map<string, Prisma.Decimal>) =>
    [...m.entries()]
      .filter(([, v]) => v.greaterThan(zero))
      .map(([currency, amount]) => ({ currency, amount: amount.toString() }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

  return { totalByCurrency: toRows(total), overdueByCurrency: toRows(overdue) };
}

export async function cancelReceivable(id: string, ctx: ServiceContext): Promise<Receivable> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cuentas por cobrar");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.receivable.findUnique({ where: { id } });
    if (!r) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
    if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (r.status === "CANCELLED") throw new ServiceError("CONFLICT", "La cuenta ya está cancelada");

    const salesInvoice = await tx.salesInvoice.findUnique({
      where: { id: r.salesInvoiceId },
      select: { status: true, number: true },
    });
    const activeCollections = await tx.collection.count({
      where: { receivableId: id, status: "CONFIRMED", tenantId: ctx.tenantId },
    });
    assertCanCancelReceivableDirect({
      salesInvoiceStatus: salesInvoice?.status,
      activeCollectionCount: activeCollections,
      paidAmount: r.paidAmount,
    });

    const receivableCancel = await tx.receivable.updateMany({
      where: { id, status: { not: "CANCELLED" }, paidAmount: r.paidAmount },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      receivableCancel.count,
      "El saldo cambió mientras cancelabas la cuenta. Revisá cobranzas e intentá de nuevo.",
    )
    const updated = await tx.receivable.findUniqueOrThrow({ where: { id } });

    await auditAr(
      ctx,
      "receivable.cancelled",
      "Receivable",
      id,
      { projectId: updated.projectId, companyId: updated.companyId },
      { after: { status: "CANCELLED", number: salesInvoice?.number ?? null }, tx },
    );

    return updated;
  });

  return updated;
}

import { deriveObligationDisplayStatus, isObligationOverdue } from "../finance/obligation-date";

type RawReceivable = Receivable & {
  clientContact: { legalName: string; fantasyName: string | null };
};

function serializeReceivable(r: RawReceivable): ReceivableView {
  const balanceDue = r.originalAmount.minus(r.paidAmount);
  const status = deriveObligationDisplayStatus(r.status, balanceDue, r.dueDate);
  return {
    ...r,
    status,
    originalAmount: r.originalAmount.toString(),
    paidAmount: r.paidAmount.toString(),
    balanceDue: balanceDue.toString(),
    clientName: r.clientContact.fantasyName ?? r.clientContact.legalName,
  };
}
