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
import { getStockBalance, lockStockBalanceKey } from "./stock-balance.service";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { serializeMoneyDecimal, serializeQtyDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import { consumptionReplayMatches, requireIdempotencyKey, withIdempotentCreate } from "../idempotency/idempotency";
import { consumptionWarehouseScopeConflict } from "./consumption-warehouse-scope";
import { sortByWbsCode } from "../budget/wbs-code-rules";

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
    quantity: serializeQtyDecimal(m.quantity),
    unitCost: m.unitCost != null ? serializeUnitPriceDecimal(m.unitCost) : null,
    totalCost: m.totalCost != null ? serializeMoneyDecimal(m.totalCost) : null,
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

  const nodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budget: {
        tenantId: ctx.tenantId,
        projectId,
        status: { in: ["APPROVED", "CLOSED"] },
      },
    },
    select: { id: true, code: true, name: true },
  });
  return sortByWbsCode(nodes);
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

  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);

  const movement = await withIdempotentCreate({
    findExisting: () =>
      prisma.stockMovement.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
        include: movementInclude,
      }),
    payloadsMatch: (existing) =>
      consumptionReplayMatches(existing, {
        warehouseId: input.warehouseId,
        productId: input.productId,
        projectId: input.projectId,
        wbsNodeId: input.wbsNodeId,
        movementDate: input.movementDate,
        quantity: input.quantity,
      }),
    create: async () => {
      const created = await createStockConsumptionOnce(input, ctx, idempotencyKey);
      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "STOCK_CONSUMPTION_CREATED",
        entityType: "StockMovement",
        entityId: created.id,
        after: { productId: input.productId, warehouseId: input.warehouseId, quantity: input.quantity },
      });
      return created;
    },
  });

  return serializeMovement(movement);
}

async function createStockConsumptionOnce(
  input: CreateStockConsumptionInput,
  ctx: ServiceContext,
  idempotencyKey: string,
) {
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

  let projectCompanyId: string | null = null;
  if (input.projectId) {
    const project = await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);
    projectCompanyId = project.companyId;
  }

  const scopeConflict = consumptionWarehouseScopeConflict({
    warehouseCompanyId: warehouse.companyId,
    warehouseProjectId: warehouse.projectId,
    productCompanyId: product.companyId,
    consumptionProjectId: input.projectId ?? null,
    projectCompanyId,
  });
  if (scopeConflict) throw new ServiceError("CONFLICT", scopeConflict);

  if (input.wbsNodeId) {
    const wbs = await prisma.wbsNode.findUnique({
      where: { id: input.wbsNodeId },
      include: {
        budget: {
          select: { tenantId: true, projectId: true, status: true },
        },
      },
    });
    if (!wbs) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");
    if (wbs.budget.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    }
    if (wbs.budget.projectId !== input.projectId) {
      throw new ServiceError("CONFLICT", "El nodo EDT no pertenece al proyecto del consumo");
    }
    if (wbs.type !== "ITEM")
      throw new ServiceError("CONFLICT", "El nodo EDT debe ser de tipo ITEM");
    if (wbs.budget.status !== "APPROVED" && wbs.budget.status !== "CLOSED") {
      throw new ServiceError(
        "CONFLICT",
        "El nodo EDT debe pertenecer a un presupuesto aprobado o cerrado",
      );
    }
  }

  const qty = new Prisma.Decimal(input.quantity);
  if (qty.lessThanOrEqualTo(0)) {
    throw new ServiceError("CONFLICT", "La cantidad debe ser mayor a cero");
  }

  const movement = await prisma.$transaction(async (tx) => {
    await lockStockBalanceKey(tx, input.warehouseId, input.productId);
    const balance = await getStockBalance(
      {
        tenantId: ctx.tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
      tx,
    );
    if (qty.greaterThan(balance)) {
      throw new ServiceError(
        "CONFLICT",
        `Stock insuficiente. Disponible: ${serializeQtyDecimal(balance)}, solicitado: ${serializeQtyDecimal(qty)}`,
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
        idempotencyKey,
        createdBy: ctx.actorUserId,
      },
      include: movementInclude,
    });
  });
  return movement;
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
    wbsNodeId?: string | null;
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
      wbsNodeId: params.wbsNodeId ?? null,
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
  tenantId: string,
): Promise<void> {
  const movements = await tx.stockMovement.findMany({
    where: { purchaseReceiptId, status: "CONFIRMED", type: "IN" },
    select: {
      id: true,
      warehouseId: true,
      productId: true,
      quantity: true,
      product: { select: { name: true, sku: true } },
    },
  });

  for (const m of movements) {
    await lockStockBalanceKey(tx, m.warehouseId, m.productId);
    const balance = await getStockBalance(
      {
        tenantId,
        warehouseId: m.warehouseId,
        productId: m.productId,
      },
      tx,
    );
    if (balance.lessThan(m.quantity)) {
      const label = m.product?.sku ? `${m.product.sku} — ${m.product.name}` : m.productId;
      throw new ServiceError(
        "CONFLICT",
        `No se puede anular la recepción: el stock de "${label}" ya fue consumido (disponible ${serializeQtyDecimal(balance)}, se revertiría ${serializeQtyDecimal(m.quantity)}).`,
      );
    }
  }

  await tx.stockMovement.updateMany({
    where: { purchaseReceiptId, tenantId, status: "CONFIRMED" },
    data: { status: "CANCELLED" },
  });
}

/** [D-055] Resolve WBS for a material line that will create stock consumption. */
export function resolveJobsiteLogMaterialWbs(
  materialWbsNodeId: string | null | undefined,
  progressWbsNodeIds: string[],
): string {
  if (materialWbsNodeId) return materialWbsNodeId;
  const unique = [...new Set(progressWbsNodeIds.filter(Boolean))];
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 0) {
    throw new ServiceError(
      "CONFLICT",
      "Los materiales con producto requieren partida EDT (indicá la partida en la línea o cargá avance en una sola partida)",
    );
  }
  throw new ServiceError(
    "CONFLICT",
    "Hay varias partidas de avance: indicá la partida EDT en cada línea de material con producto",
  );
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
    progressWbsNodeIds: string[];
    materials: Array<{
      id: string;
      productId: string | null;
      warehouseId: string | null;
      wbsNodeId: string | null;
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
    await lockStockBalanceKey(tx, warehouseId, productId);
    const balance = await getStockBalance(
      {
        tenantId: params.tenantId,
        warehouseId,
        productId,
      },
      tx,
    );
    if (qty.greaterThan(balance)) {
      throw new ServiceError(
        "CONFLICT",
        `Stock insuficiente al aprobar el parte. Disponible: ${serializeQtyDecimal(balance)}, solicitado: ${serializeQtyDecimal(qty)}`,
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
    const product = await tx.product.findUnique({
      where: { id: m.productId },
      select: { companyId: true, tenantId: true, status: true },
    });
    if (!product || product.tenantId !== params.tenantId) {
      throw new ServiceError("NOT_FOUND", "Producto no encontrado");
    }
    if (product.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "El producto no está activo");
    }
    const scopeConflict = consumptionWarehouseScopeConflict({
      warehouseCompanyId: warehouse.companyId,
      warehouseProjectId: warehouse.projectId,
      productCompanyId: product.companyId,
      consumptionProjectId: params.projectId,
      projectCompanyId: params.companyId,
    });
    if (scopeConflict) throw new ServiceError("CONFLICT", scopeConflict);

    const wbsNodeId = resolveJobsiteLogMaterialWbs(m.wbsNodeId, params.progressWbsNodeIds);
    if (!m.wbsNodeId) {
      await tx.jobsiteLogMaterialUsage.update({
        where: { id: m.id },
        data: { wbsNodeId },
      });
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
        wbsNodeId,
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
