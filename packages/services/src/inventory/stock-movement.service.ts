import {
  Prisma,
  prisma,
  StockMovement,
  StockMovementSourceType,
  StockMovementStatus,
} from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateStockConsumptionInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getStockBalance } from "./stock-balance.service";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";

// ─── View types ───────────────────────────────────────────────────────────────

export type StockMovementView = Omit<StockMovement, "quantity" | "unitCost" | "totalCost"> & {
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  productName: string;
  warehouseName: string;
};

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeMovement(
  m: StockMovement & {
    product: { name: string };
    warehouse: { name: string };
  },
): StockMovementView {
  return {
    ...m,
    quantity: m.quantity.toString(),
    unitCost: m.unitCost?.toString() ?? null,
    totalCost: m.totalCost?.toString() ?? null,
    productName: m.product.name,
    warehouseName: m.warehouse.name,
  };
}

const movementInclude = {
  product: { select: { name: true } },
  warehouse: { select: { name: true } },
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getStockMovementById(
  id: string,
  ctx: ServiceContext,
): Promise<StockMovementView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos de stock");
  }
  const m = await prisma.stockMovement.findUnique({ where: { id }, include: movementInclude });
  if (!m) throw new ServiceError("NOT_FOUND", "Movimiento de stock no encontrado");
  if (m.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeMovement(m);
}

export async function listStockMovements(
  filters: {
    warehouseId?: string;
    productId?: string;
    projectId?: string;
    purchaseReceiptId?: string;
    sourceType?: StockMovementSourceType;
    sourceIds?: string[];
    status?: StockMovementStatus;
  },
  ctx: ServiceContext,
): Promise<StockMovementView[]> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos de stock");
  }
  const sourceIds = filters.sourceIds?.filter(Boolean) ?? [];
  const movements = await prisma.stockMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      warehouseId: filters.warehouseId ?? undefined,
      productId: filters.productId ?? undefined,
      projectId: filters.projectId ?? undefined,
      purchaseReceiptId: filters.purchaseReceiptId ?? undefined,
      sourceType: filters.sourceType ?? undefined,
      ...(sourceIds.length > 0 ? { sourceId: { in: sourceIds } } : {}),
      status: filters.status ?? undefined,
    },
    include: movementInclude,
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
  });
  return movements.map(serializeMovement);
}

export type InventoryConsumptionWbsOption = {
  id: string;
  code: string;
  name: string;
};

/** WBS items available to inventory consumption, independent of the PROCUREMENT module. */
export async function listInventoryConsumptionWbsOptions(
  projectId: string,
  ctx: ServiceContext,
): Promise<InventoryConsumptionWbsOption[]> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar consumos de stock");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }

  return prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budget: {
        tenantId: ctx.tenantId,
        projectId,
        status: { in: ["APPROVED", "CLOSED"] },
      },
    },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }, { sortOrder: "asc" }],
  });
}

// ─── Consumption (OUT) ────────────────────────────────────────────────────────

export async function createStockConsumption(
  input: CreateStockConsumptionInput,
  ctx: ServiceContext,
): Promise<StockMovementView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar consumos de stock");
  }

  const [warehouse, product] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: input.warehouseId } }),
    prisma.product.findUnique({ where: { id: input.productId } }),
  ]);

  if (!warehouse) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (warehouse.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (warehouse.status !== "ACTIVE")
    throw new ServiceError("CONFLICT", "El depósito no está activo");

  if (!product) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  if (product.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (product.status !== "ACTIVE") throw new ServiceError("CONFLICT", "El producto no está activo");

  if (input.projectId) {
    await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);
  }

  if (input.wbsNodeId) {
    const wbs = await prisma.wbsNode.findUnique({
      where: { id: input.wbsNodeId },
      include: {
        budget: {
          select: { tenantId: true, projectId: true, status: true },
        },
      },
    });
    if (!wbs) throw new ServiceError("NOT_FOUND", "Nodo WBS no encontrado");
    if (wbs.budget.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    }
    if (wbs.budget.projectId !== input.projectId) {
      throw new ServiceError("CONFLICT", "El nodo WBS no pertenece al proyecto del consumo");
    }
    if (wbs.type !== "ITEM")
      throw new ServiceError("CONFLICT", "El nodo WBS debe ser de tipo ITEM");
    if (wbs.budget.status !== "APPROVED" && wbs.budget.status !== "CLOSED") {
      throw new ServiceError(
        "CONFLICT",
        "El nodo WBS debe pertenecer a un presupuesto aprobado o cerrado",
      );
    }
  }

  const qty = new Prisma.Decimal(input.quantity);
  if (qty.lessThanOrEqualTo(0)) {
    throw new ServiceError("CONFLICT", "La cantidad debe ser mayor a cero");
  }

  const movement = await prisma.$transaction(async (tx) => {
    // Check stock balance inside transaction
    const balance = await getStockBalance({
      tenantId: ctx.tenantId,
      warehouseId: input.warehouseId,
      productId: input.productId,
    });
    if (qty.greaterThan(balance)) {
      throw new ServiceError(
        "CONFLICT",
        `Stock insuficiente. Disponible: ${balance.toString()}, solicitado: ${qty.toString()}`,
      );
    }

    return tx.stockMovement.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: warehouse.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        projectId: input.projectId,
        wbsNodeId: input.wbsNodeId ?? null,
        type: "OUT",
        sourceType: "CONSUMPTION",
        movementDate: new Date(input.movementDate),
        quantity: qty,
        status: "CONFIRMED",
        notes: input.notes ?? null,
        createdBy: ctx.actorUserId,
      },
      include: movementInclude,
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "STOCK_CONSUMPTION_CREATED",
    entityType: "StockMovement",
    entityId: movement.id,
    after: { productId: input.productId, warehouseId: input.warehouseId, quantity: input.quantity },
  });

  return serializeMovement(movement);
}

// ─── Internal: create IN movement from receipt line ───────────────────────────

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function createReceiptStockMovement(
  tx: TxClient,
  params: {
    tenantId: string;
    companyId: string;
    warehouseId: string;
    productId: string;
    projectId: string | null;
    purchaseReceiptId: string;
    purchaseReceiptLineId: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    movementDate: Date;
    createdBy: string;
  },
): Promise<StockMovement> {
  return tx.stockMovement.create({
    data: {
      tenantId: params.tenantId,
      companyId: params.companyId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      projectId: params.projectId,
      purchaseReceiptId: params.purchaseReceiptId,
      purchaseReceiptLineId: params.purchaseReceiptLineId,
      type: "IN",
      sourceType: "PURCHASE_RECEIPT",
      sourceId: params.purchaseReceiptId,
      movementDate: params.movementDate,
      quantity: params.quantity,
      unitCost: params.unitCost,
      totalCost: params.quantity.times(params.unitCost),
      status: "CONFIRMED",
      createdBy: params.createdBy,
    },
  });
}

export async function cancelReceiptStockMovements(
  tx: TxClient,
  purchaseReceiptId: string,
): Promise<void> {
  await tx.stockMovement.updateMany({
    where: { purchaseReceiptId, status: "CONFIRMED" },
    data: { status: "CANCELLED" },
  });
}

/** P-LOG-05 — consumo de inventario al aprobar un parte de obra (idempotente por línea de material). */
export async function createJobsiteLogMaterialStockMovements(
  tx: TxClient,
  params: {
    jobsiteLogId: string;
    projectId: string;
    logDate: Date;
    tenantId: string;
    companyId: string;
    actorUserId: string;
    materials: Array<{
      id: string;
      productId: string | null;
      warehouseId: string | null;
      quantity: Prisma.Decimal;
      description: string;
      notes: string | null;
    }>;
  },
): Promise<number> {
  let created = 0;

  const qtyByPair = new Map<
    string,
    { productId: string; warehouseId: string; qty: Prisma.Decimal }
  >();
  for (const m of params.materials) {
    if (!m.productId || !m.warehouseId) continue;
    if (m.quantity.lessThanOrEqualTo(0)) continue;
    const key = `${m.productId}:${m.warehouseId}`;
    const prev = qtyByPair.get(key);
    if (prev) {
      prev.qty = prev.qty.add(m.quantity);
    } else {
      qtyByPair.set(key, {
        productId: m.productId,
        warehouseId: m.warehouseId,
        qty: m.quantity,
      });
    }
  }

  for (const { productId, warehouseId, qty } of qtyByPair.values()) {
    const balance = await getStockBalance({
      tenantId: params.tenantId,
      warehouseId,
      productId,
    });
    if (qty.greaterThan(balance)) {
      throw new ServiceError(
        "CONFLICT",
        `Stock insuficiente al aprobar el parte. Disponible: ${balance.toString()}, solicitado: ${qty.toString()}`,
      );
    }
  }

  for (const m of params.materials) {
    if (!m.productId || !m.warehouseId) continue;
    if (m.quantity.lessThanOrEqualTo(0)) continue;

    const existing = await tx.stockMovement.findFirst({
      where: {
        tenantId: params.tenantId,
        sourceType: "CONSUMPTION",
        sourceId: m.id,
        status: "CONFIRMED",
      },
    });
    if (existing) continue;

    const warehouse = await tx.warehouse.findUnique({ where: { id: m.warehouseId } });
    if (!warehouse || warehouse.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "El depósito del material no está activo");
    }

    const noteParts = [`Parte de obra`, m.description];
    if (m.notes) noteParts.push(m.notes);

    await tx.stockMovement.create({
      data: {
        tenantId: params.tenantId,
        companyId: warehouse.companyId ?? params.companyId,
        warehouseId: m.warehouseId,
        productId: m.productId,
        projectId: params.projectId,
        type: "OUT",
        sourceType: "CONSUMPTION",
        sourceId: m.id,
        movementDate: params.logDate,
        quantity: m.quantity,
        status: "CONFIRMED",
        notes: noteParts.join(" · "),
        createdBy: params.actorUserId,
      },
    });
    created++;
  }

  return created;
}
