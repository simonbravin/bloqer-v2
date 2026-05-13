import { prisma, Payable, Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
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
  return serializePayable(p);
}

export async function listPayablesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PayableView[]> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const rows = await prisma.payable.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: { supplierContact: { select: { legalName: true, fantasyName: true } } },
    orderBy: { dueDate: "asc" },
  });
  return rows.map(serializePayable);
}

export type CompanyPayableListFilters = {
  status?:            "OPEN" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
  supplierContactId?: string;
  dueDateFrom?:       string;
  dueDateTo?:         string;
};

export type CompanyPayableListRow = PayableView & {
  /** `FP-00001` style; null if invoice row missing (should not happen). */
  supplierInvoiceCode: string | null;
};

/** Payables with no project. Requires VIEW AP only. */
export async function listCompanyPayables(
  ctx: ServiceContext,
  filters?: CompanyPayableListFilters,
): Promise<CompanyPayableListRow[]> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
  }

  const where: Prisma.PayableWhereInput = {
    tenantId:  ctx.tenantId,
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

  const rows = await prisma.payable.findMany({
    where,
    include: {
      supplierContact: { select: { legalName: true, fantasyName: true } },
      supplierInvoice: { select: { number: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const mapped: CompanyPayableListRow[] = rows.map((r) => {
    const { supplierInvoice, ...rest } = r;
    const base = serializePayable(rest);
    const num  = supplierInvoice?.number;
    return {
      ...base,
      supplierInvoiceCode: num != null ? `FP-${String(num).padStart(5, "0")}` : null,
    };
  });
  if (!filters?.status) return mapped;
  return mapped.filter((p) => p.status === filters.status);
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
  return serializePayable(p);
}

export async function cancelPayable(id: string, ctx: ServiceContext): Promise<Payable> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cuentas por pagar");
  }
  const p = await prisma.payable.findUnique({ where: { id } });
  if (!p) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (p.status === "CANCELLED") throw new ServiceError("CONFLICT", "La cuenta ya está cancelada");
  if (p.paidAmount.greaterThan(0)) {
    throw new ServiceError("CONFLICT", "No se puede cancelar una cuenta con pagos. Cancele los pagos primero.");
  }

  const updated = await prisma.payable.update({
    where: { id },
    data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "payable.cancelled",
    entityType: "Payable",
    entityId: id,
    after: { status: "CANCELLED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawPayable = Payable & {
  supplierContact: { legalName: string; fantasyName: string | null };
};

export function serializePayable(p: RawPayable): PayableView {
  const balanceDue = p.originalAmount.minus(p.paidAmount);
  // OVERDUE computed on read — no background job (same as D5 / ReceivableStatus)
  let status = p.status;
  if (
    status !== "PAID" && status !== "CANCELLED" &&
    balanceDue.greaterThan(0) && p.dueDate < new Date()
  ) {
    status = "OVERDUE";
  }
  return {
    ...p,
    status,
    originalAmount: p.originalAmount.toString(),
    paidAmount:     p.paidAmount.toString(),
    balanceDue:     balanceDue.toString(),
    supplierName:   p.supplierContact.fantasyName ?? p.supplierContact.legalName,
  };
}
