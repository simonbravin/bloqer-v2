import { prisma, Warehouse, WarehouseStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

// ─── View types ───────────────────────────────────────────────────────────────

export type WarehouseView = Omit<Warehouse, never>;

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getWarehouseById(id: string, ctx: ServiceContext): Promise<WarehouseView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver depósitos");
  }
  const wh = await prisma.warehouse.findUnique({ where: { id } });
  if (!wh) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (wh.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return wh;
}

export async function listWarehouses(
  filters: { companyId?: string; projectId?: string; status?: WarehouseStatus },
  ctx: ServiceContext,
): Promise<WarehouseView[]> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver depósitos");
  }
  return prisma.warehouse.findMany({
    where: {
      tenantId:  ctx.tenantId,
      companyId: filters.companyId ?? undefined,
      projectId: filters.projectId ?? undefined,
      status:    filters.status ?? undefined,
    },
    orderBy: [{ name: "asc" }],
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createWarehouse(
  input: CreateWarehouseInput,
  ctx: ServiceContext,
): Promise<WarehouseView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear depósitos");
  }

  const existing = await prisma.warehouse.findFirst({
    where: { tenantId: ctx.tenantId, companyId: input.companyId, name: input.name },
  });
  if (existing) {
    throw new ServiceError("CONFLICT", `Ya existe un depósito con el nombre "${input.name}"`);
  }

  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
    if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }

  const wh = await prisma.warehouse.create({
    data: {
      tenantId:  ctx.tenantId,
      companyId: input.companyId,
      projectId: input.projectId ?? null,
      name:      input.name,
      type:      input.type ?? "CENTRAL",
      address:   input.address ?? null,
      notes:     input.notes ?? null,
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "WAREHOUSE_CREATED",
    entityType:  "Warehouse",
    entityId:    wh.id,
    after:       { name: wh.name, type: wh.type },
  });

  return wh;
}

export async function updateWarehouse(
  id: string,
  input: UpdateWarehouseInput,
  ctx: ServiceContext,
): Promise<WarehouseView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar depósitos");
  }

  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status === WarehouseStatus.CLOSED) {
    throw new ServiceError("CONFLICT", "No se puede editar un depósito cerrado");
  }

  const wh = await prisma.warehouse.update({
    where: { id },
    data: {
      name:      input.name    ?? undefined,
      type:      input.type    ?? undefined,
      address:   input.address ?? undefined,
      notes:     input.notes   ?? undefined,
      updatedBy: ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "WAREHOUSE_UPDATED",
    entityType:  "Warehouse",
    entityId:    id,
    after:       input,
  });

  return wh;
}

export async function deactivateWarehouse(id: string, ctx: ServiceContext): Promise<WarehouseView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para desactivar depósitos");
  }

  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== WarehouseStatus.ACTIVE) {
    throw new ServiceError("CONFLICT", `El depósito ya está en estado "${existing.status}"`);
  }

  const wh = await prisma.warehouse.update({
    where: { id },
    data: { status: WarehouseStatus.INACTIVE, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "WAREHOUSE_DEACTIVATED",
    entityType:  "Warehouse",
    entityId:    id,
  });

  return wh;
}

export async function reactivateWarehouse(id: string, ctx: ServiceContext): Promise<WarehouseView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para reactivar depósitos");
  }

  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status === WarehouseStatus.ACTIVE) {
    throw new ServiceError("CONFLICT", "El depósito ya está activo");
  }
  if (existing.status === WarehouseStatus.CLOSED) {
    throw new ServiceError("CONFLICT", "No se puede reactivar un depósito cerrado");
  }

  const wh = await prisma.warehouse.update({
    where: { id },
    data: { status: WarehouseStatus.ACTIVE, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "WAREHOUSE_REACTIVATED",
    entityType:  "Warehouse",
    entityId:    id,
  });

  return wh;
}
