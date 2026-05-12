import { Prisma, prisma, Receivable, ReceivableStatus } from "@bloqer/database";
import { canEditArArea, canViewArProjectArea } from "./ar-access";
import { log } from "../audit/audit.service";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

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

export async function listReceivablesByProject(
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
    where: { projectId, tenantId: ctx.tenantId },
    include: { clientContact: { select: { legalName: true, fantasyName: true } } },
    orderBy: { dueDate: "asc" },
  });
  return rows.map(serializeReceivable);
}

export async function cancelReceivable(id: string, ctx: ServiceContext): Promise<Receivable> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cuentas por cobrar");
  }
  const r = await prisma.receivable.findUnique({ where: { id } });
  if (!r) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (r.status === "CANCELLED") throw new ServiceError("CONFLICT", "La cuenta ya está cancelada");
  if (r.paidAmount.greaterThan(0)) {
    throw new ServiceError("CONFLICT", "No se puede cancelar una cuenta con pagos parciales. Revisar en módulo de Cobranzas.");
  }

  const updated = await prisma.receivable.update({
    where: { id },
    data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "receivable.cancelled",
    entityType: "Receivable",
    entityId: id,
    after: { status: "CANCELLED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawReceivable = Receivable & {
  clientContact: { legalName: string; fantasyName: string | null };
};

function serializeReceivable(r: RawReceivable): ReceivableView {
  const balanceDue = r.originalAmount.minus(r.paidAmount);
  // BR-AR-002 / D5: OVERDUE computed on read — no background job yet
  let status = r.status;
  if (
    status !== "PAID" && status !== "CANCELLED" &&
    balanceDue.greaterThan(0) && r.dueDate < new Date()
  ) {
    status = "OVERDUE";
  }
  return {
    ...r,
    status,
    originalAmount: r.originalAmount.toString(),
    paidAmount: r.paidAmount.toString(),
    balanceDue: balanceDue.toString(),
    clientName: r.clientContact.fantasyName ?? r.clientContact.legalName,
  };
}
