import { prisma, type Warehouse, type WarehouseStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { isCrossCompany } from "../company-scope";
import { lockProjectForMutation } from "../project/project-write-lock";
import { requireProjectAccess } from "../security/access";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceError, type ServiceContext } from "../types";
import { assertInventoryWarehouseScope, inventoryWarehouseWhere } from "./inventory-scope";

export type WarehouseView = Omit<Warehouse, never>;
async function authorize(ctx: ServiceContext, action: "VIEW" | "EDIT") {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, action, "INVENTORY"))
    throw new ServiceError("FORBIDDEN", "Sin permisos para operar depósitos");
}
export async function getWarehouseById(id: string, ctx: ServiceContext): Promise<WarehouseView> {
  await authorize(ctx, "VIEW");
  const row = await prisma.warehouse.findUnique({ where: { id } });
  if (!row) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  await assertInventoryWarehouseScope(row, ctx);
  return row;
}
export async function listWarehouses(
  filters: { companyId?: string; projectId?: string; status?: WarehouseStatus },
  ctx: ServiceContext,
): Promise<WarehouseView[]> {
  await authorize(ctx, "VIEW");
  if (filters.companyId && isCrossCompany(filters.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "Empresa fuera del contexto autorizado");
  if (filters.projectId) await requireProjectAccess(filters.projectId, ctx);
  const rows = await prisma.warehouse.findMany({
    where: {
      AND: [
        await inventoryWarehouseWhere(ctx),
        { companyId: filters.companyId, projectId: filters.projectId, status: filters.status },
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  await Promise.all(rows.map((row) => assertInventoryWarehouseScope(row, ctx)));
  return rows;
}
/** General warehouses and the selected project's own warehouses, never another worksite's. */
export async function listInventoryConsumptionWarehouses(
  projectId: string,
  ctx: ServiceContext,
): Promise<WarehouseView[]> {
  await authorize(ctx, "VIEW");
  const project = await requireProjectAccess(projectId, ctx);
  const rows = await prisma.warehouse.findMany({
    where: {
      AND: [
        await inventoryWarehouseWhere(ctx),
        {
          status: "ACTIVE",
          ...(project.companyId ? { companyId: project.companyId } : {}),
          OR: [{ projectId: null }, { projectId }],
        },
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  await Promise.all(rows.map((row) => assertInventoryWarehouseScope(row, ctx)));
  return rows;
}
export async function createWarehouse(
  input: CreateWarehouseInput,
  ctx: ServiceContext,
): Promise<WarehouseView> {
  await authorize(ctx, "EDIT");
  const parsed = createWarehouseSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Depósito inválido");
  input = parsed.data;
  if (isCrossCompany(input.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "Empresa fuera del contexto autorizado");
  if (input.projectId) {
    const project = await requireProjectAccess(input.projectId, ctx);
    if (project.companyId && project.companyId !== input.companyId)
      throw new ServiceError("VALIDATION", "El proyecto no pertenece a la empresa seleccionada");
  }
  return prisma.$transaction(
    async (tx) => {
      if (input.projectId) {
        const project = await lockProjectForMutation(tx, input.projectId, ctx.tenantId);
        if (project.companyId && project.companyId !== input.companyId)
          throw new ServiceError("CONFLICT", "Las relaciones del depósito cambiaron");
      }
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${input.companyId} FOR NO KEY UPDATE`;
      if (
        !(await tx.company.findFirst({
          where: { id: input.companyId, tenantId: ctx.tenantId },
          select: { id: true },
        }))
      )
        throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
      if (
        await tx.warehouse.findFirst({
          where: { tenantId: ctx.tenantId, companyId: input.companyId, name: input.name },
        })
      )
        throw new ServiceError("CONFLICT", "Ya existe un depósito con ese nombre");
      const row = await tx.warehouse.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: row.companyId,
          projectId: row.projectId,
          actorUserId: ctx.actorUserId,
          action: "WAREHOUSE_CREATED",
          entityType: "Warehouse",
          entityId: row.id,
          after: { name: row.name, type: row.type },
        },
        tx,
      );
      return row;
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
async function mutateWarehouse(
  id: string,
  ctx: ServiceContext,
  action: string,
  change: (row: Warehouse) => {
    name?: string;
    type?: Warehouse["type"];
    address?: string | null;
    notes?: string | null;
    status?: WarehouseStatus;
  },
): Promise<WarehouseView> {
  await authorize(ctx, "EDIT");
  const preview = await prisma.warehouse.findUnique({ where: { id } });
  if (!preview) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  await assertInventoryWarehouseScope(preview, ctx);
  return prisma.$transaction(
    async (tx) => {
      if (preview.projectId) await lockProjectForMutation(tx, preview.projectId, ctx.tenantId);
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${preview.companyId} FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${id} FOR UPDATE`;
      const current = await tx.warehouse.findUnique({ where: { id } });
      if (
        !current ||
        current.tenantId !== ctx.tenantId ||
        current.companyId !== preview.companyId ||
        current.projectId !== preview.projectId
      )
        throw new ServiceError("CONFLICT", "El depósito cambió. Recargá e intentá de nuevo.");
      if (current.status === "CLOSED")
        throw new ServiceError("CONFLICT", "No se puede modificar un depósito cerrado");
      const data = change(current);
      if (
        data.name &&
        (await tx.warehouse.findFirst({
          where: {
            tenantId: ctx.tenantId,
            companyId: current.companyId,
            name: data.name,
            id: { not: id },
          },
        }))
      )
        throw new ServiceError("CONFLICT", "Ya existe un depósito con ese nombre");
      const row = await tx.warehouse.update({
        where: { id },
        data: { ...data, updatedBy: ctx.actorUserId },
      });
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: row.companyId,
          projectId: row.projectId,
          actorUserId: ctx.actorUserId,
          action,
          entityType: "Warehouse",
          entityId: id,
          before: { name: current.name, status: current.status },
          after: data,
        },
        tx,
      );
      return row;
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function updateWarehouse(
  id: string,
  input: UpdateWarehouseInput,
  ctx: ServiceContext,
): Promise<WarehouseView> {
  const parsed = updateWarehouseSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Depósito inválido");
  return mutateWarehouse(id, ctx, "WAREHOUSE_UPDATED", () => parsed.data);
}
export async function deactivateWarehouse(id: string, ctx: ServiceContext): Promise<WarehouseView> {
  return mutateWarehouse(id, ctx, "WAREHOUSE_DEACTIVATED", (row) => {
    if (row.status !== "ACTIVE") throw new ServiceError("CONFLICT", "El depósito ya está inactivo");
    return { status: "INACTIVE" };
  });
}
export async function reactivateWarehouse(id: string, ctx: ServiceContext): Promise<WarehouseView> {
  return mutateWarehouse(id, ctx, "WAREHOUSE_REACTIVATED", (row) => {
    if (row.status !== "INACTIVE") throw new ServiceError("CONFLICT", "El depósito ya está activo");
    return { status: "ACTIVE" };
  });
}
