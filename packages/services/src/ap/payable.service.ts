import { prisma, Payable } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canViewApProjectArea } from "./ap-access";

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
