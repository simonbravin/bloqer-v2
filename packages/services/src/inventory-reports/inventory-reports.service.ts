import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { z } from "zod";
import { isCrossCompany } from "../company-scope";
import { requireProjectAccess } from "../security/access";
import {
  inventoryMovementWhere,
  inventoryWarehouseWhere,
  inventoryMovementParentInclude,
  assertInventoryMovementRelations,
  assertInventoryMovementParentScope,
  assertInventoryProductScope,
  assertInventoryWarehouseScope,
} from "../inventory/inventory-scope";
import { inventoryMovementCostProvenance } from "../inventory/inventory-movement-cost";
import { stockMovementQuantityDelta } from "../inventory/stock-balance.service";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function movementSignedQty(type: string, qty: Prisma.Decimal): Prisma.Decimal | null {
  return type === "ADJUSTMENT" ? null : stockMovementQuantityDelta({ type, quantity: qty });
}

const SOURCE_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Recepción de compra",
  CONSUMPTION: "Consumo",
  TRANSFER: "Transferencia",
  ADJUSTMENT: "Ajuste",
  OPENING_BALANCE: "Saldo inicial",
};

const optionalId = z.string().guid().optional();
const reportDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const day = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }, "Fecha inválida");
const balanceFiltersSchema = z.object({
  warehouseId: optionalId,
  productId: optionalId,
  companyId: optionalId,
  projectId: optionalId,
  includeZeroStock: z.boolean().optional(),
});
const movementFiltersSchema = balanceFiltersSchema
  .omit({ includeZeroStock: true })
  .extend({
    wbsNodeId: optionalId,
    sourceType: z
      .enum(["PURCHASE_RECEIPT", "CONSUMPTION", "TRANSFER", "ADJUSTMENT", "OPENING_BALANCE"])
      .optional(),
    movementType: z.enum(["IN", "OUT", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT"]).optional(),
    dateFrom: reportDay.optional(),
    dateTo: reportDay.optional(),
  })
  .refine((f) => !f.dateFrom || !f.dateTo || f.dateFrom <= f.dateTo, "Rango de fechas inválido");

async function assertFilterParents(
  filters: StockBalanceFilters & { wbsNodeId?: string },
  ctx: ServiceContext,
) {
  if (filters.companyId) {
    if (isCrossCompany(filters.companyId, ctx))
      throw new ServiceError("FORBIDDEN", "Empresa fuera del contexto autorizado");
    if (
      !(await prisma.company.findFirst({
        where: { id: filters.companyId, tenantId: ctx.tenantId },
        select: { id: true },
      }))
    ) {
      throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
    }
  }
  if (filters.projectId) await requireProjectAccess(filters.projectId, ctx);
  if (filters.productId) {
    const product = await prisma.product.findUnique({ where: { id: filters.productId } });
    if (!product) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
    await assertInventoryProductScope(product, ctx);
  }
  if (filters.warehouseId) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: filters.warehouseId } });
    if (!warehouse) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
    await assertInventoryWarehouseScope(warehouse, ctx);
  }
  if (filters.wbsNodeId) {
    const node = await prisma.wbsNode.findUnique({
      where: { id: filters.wbsNodeId },
      include: { budget: true },
    });
    if (!node || node.budget.tenantId !== ctx.tenantId)
      throw new ServiceError("NOT_FOUND", "Partida no encontrada");
    if (isCrossCompany(node.budget.companyId, ctx))
      throw new ServiceError("FORBIDDEN", "Partida fuera del contexto autorizado");
    await requireProjectAccess(node.budget.projectId, ctx);
    if (filters.projectId && node.budget.projectId !== filters.projectId)
      throw new ServiceError("VALIDATION", "La partida no pertenece a la obra seleccionada");
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockBalanceRow = {
  productId: string;
  productSku: string;
  productName: string;
  productUnit: string;
  warehouseId: string;
  warehouseName: string;
  companyId: string;
  companyName: string;
  projectId: string | null;
  projectName: string | null;
  quantityOnHand: string;
  quantityReserved: null;
  quantityAvailable: string;
  lastMovementDate: string | null;
  flags: {
    zeroStock: boolean;
    negativeStock: boolean;
    adjustmentPresent: boolean;
  };
};

export type StockMovementReportRow = {
  id: string;
  movementDate: string;
  productId: string;
  productSku: string;
  productName: string;
  productUnit: string;
  warehouseId: string;
  warehouseName: string;
  projectId: string | null;
  projectName: string | null;
  wbsNodeId: string | null;
  wbsNodeName: string | null;
  type: string;
  sourceType: string;
  sourceLabel: string;
  quantity: string;
  signedQuantity: string | null;
  unitCost: string | null;
  totalCost: string | null;
  costCurrency: string | null;
  costWarning: string | null;
  notes: string | null;
};

export type ProductStockDetail = {
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    status: string;
    description: string | null;
  };
  balancesByWarehouse: StockBalanceRow[];
  movements: StockMovementReportRow[];
};

export type WarehouseStockDetail = {
  warehouse: {
    id: string;
    name: string;
    type: string;
    status: string;
    address: string | null;
  };
  balancesByProduct: StockBalanceRow[];
  movements: StockMovementReportRow[];
};

// ─── Filters ──────────────────────────────────────────────────────────────────

export type StockBalanceFilters = {
  warehouseId?: string;
  productId?: string;
  companyId?: string;
  projectId?: string;
  includeZeroStock?: boolean;
};

export type StockMovementReportFilters = {
  warehouseId?: string;
  productId?: string;
  projectId?: string;
  wbsNodeId?: string;
  companyId?: string;
  sourceType?: string;
  movementType?: string;
  dateFrom?: string;
  dateTo?: string;
};

// ─── Stock Balance Report ─────────────────────────────────────────────────────

export async function getStockBalanceReport(
  filters: StockBalanceFilters,
  ctx: ServiceContext,
): Promise<StockBalanceRow[]> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de inventario");
  }
  const parsed = balanceFiltersSchema.safeParse(filters);
  if (!parsed.success) throw new ServiceError("VALIDATION", "Filtros de inventario inválidos");
  filters = parsed.data;
  await assertFilterParents(filters, ctx);

  const movements = await prisma.stockMovement.findMany({
    where: {
      AND: [
        {
          tenantId: ctx.tenantId,
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          warehouse: await inventoryWarehouseWhere(ctx),
        },
        ...(filters.projectId ? [{ warehouse: { projectId: filters.projectId } }] : []),
      ],
      status: "CONFIRMED",
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
    },
    include: {
      ...inventoryMovementParentInclude,
      company: { select: { name: true } },
      warehouse: { include: { project: { select: { name: true } } } },
    },
  });

  type Acc = {
    productId: string;
    productSku: string;
    productName: string;
    productUnit: string;
    warehouseId: string;
    warehouseName: string;
    companyId: string;
    companyName: string;
    projectId: string | null;
    projectName: string | null;
    balance: Prisma.Decimal;
    lastMovementDate: Date | null;
    adjustmentPresent: boolean;
  };

  const map = new Map<string, Acc>();

  for (const m of movements) {
    // The authorized warehouse's physical quantity includes all its attributions.
    // Do not expose or return labels of a movement's separate, inaccessible project.
    assertInventoryMovementParentScope(m);
    await assertInventoryProductScope(m.product, ctx);
    await assertInventoryWarehouseScope(m.warehouse, ctx);
    const key = `${m.productId}|${m.warehouseId}`;
    if (!map.has(key)) {
      map.set(key, {
        productId: m.productId,
        productSku: m.product.sku,
        productName: m.product.name,
        productUnit: m.product.unit,
        warehouseId: m.warehouseId,
        warehouseName: m.warehouse.name,
        companyId: m.companyId,
        companyName: m.company.name,
        projectId: m.warehouse.projectId,
        projectName: m.warehouse.project?.name ?? null,
        balance: new Prisma.Decimal(0),
        lastMovementDate: null,
        adjustmentPresent: false,
      });
    }
    const acc = map.get(key)!;

    acc.balance = acc.balance.plus(stockMovementQuantityDelta(m));
    if (m.type === "ADJUSTMENT") acc.adjustmentPresent = true;

    if (!acc.lastMovementDate || m.movementDate > acc.lastMovementDate) {
      acc.lastMovementDate = m.movementDate;
    }
  }

  const rows: StockBalanceRow[] = [];
  for (const acc of map.values()) {
    const isZero = acc.balance.equals(0);
    const isNeg = acc.balance.lessThan(0);
    // Always include negative stock; exclude zero stock unless includeZeroStock is true
    if (isZero && !isNeg && !filters.includeZeroStock) continue;
    rows.push({
      productId: acc.productId,
      productSku: acc.productSku,
      productName: acc.productName,
      productUnit: acc.productUnit,
      warehouseId: acc.warehouseId,
      warehouseName: acc.warehouseName,
      companyId: acc.companyId,
      companyName: acc.companyName,
      projectId: acc.projectId,
      projectName: acc.projectName,
      quantityOnHand: serializeQtyDecimal(acc.balance),
      quantityReserved: null,
      quantityAvailable: serializeQtyDecimal(acc.balance),
      lastMovementDate: acc.lastMovementDate?.toISOString().slice(0, 10) ?? null,
      flags: { zeroStock: isZero, negativeStock: isNeg, adjustmentPresent: acc.adjustmentPresent },
    });
  }

  return rows.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) || a.warehouseName.localeCompare(b.warehouseName),
  );
}

// ─── Stock Movement Report ────────────────────────────────────────────────────

export async function getStockMovementReport(
  filters: StockMovementReportFilters,
  ctx: ServiceContext,
): Promise<StockMovementReportRow[]> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos de inventario");
  }
  const parsed = movementFiltersSchema.safeParse(filters);
  if (!parsed.success) throw new ServiceError("VALIDATION", "Filtros de movimientos inválidos");
  filters = parsed.data;
  await assertFilterParents(filters, ctx);

  const rows = await prisma.stockMovement.findMany({
    where: {
      ...(await inventoryMovementWhere(ctx, filters.projectId)),
      status: "CONFIRMED",
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.wbsNodeId ? { wbsNodeId: filters.wbsNodeId } : {}),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.sourceType ? { sourceType: filters.sourceType as never } : {}),
      ...(filters.movementType ? { type: filters.movementType as never } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            movementDate: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    },
    include: { ...inventoryMovementParentInclude, project: true },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
  });

  for (const row of rows) await assertInventoryMovementRelations(row, ctx);

  return rows.map((m) => ({
    id: m.id,
    movementDate: m.movementDate.toISOString().slice(0, 10),
    productId: m.productId,
    productSku: m.product.sku,
    productName: m.product.name,
    productUnit: m.product.unit,
    warehouseId: m.warehouseId,
    warehouseName: m.warehouse.name,
    projectId: m.projectId,
    projectName: m.project?.name ?? null,
    wbsNodeId: m.wbsNodeId,
    wbsNodeName: m.wbsNode?.name ?? null,
    type: m.type as string,
    sourceType: m.sourceType as string,
    sourceLabel: SOURCE_LABELS[m.sourceType as string] ?? (m.sourceType as string),
    quantity: serializeQtyDecimal(m.quantity),
    signedQuantity:
      movementSignedQty(m.type, m.quantity) == null
        ? null
        : serializeQtyDecimal(movementSignedQty(m.type, m.quantity)!),
    unitCost: m.unitCost != null ? serializeUnitPriceDecimal(m.unitCost) : null,
    totalCost: m.totalCost != null ? serializeMoneyDecimal(m.totalCost) : null,
    ...inventoryMovementCostProvenance(m),
    notes: m.notes,
  }));
}

// ─── Product Stock Detail ─────────────────────────────────────────────────────

export async function getProductStockDetail(
  productId: string,
  filters: { dateFrom?: string; dateTo?: string },
  ctx: ServiceContext,
): Promise<ProductStockDetail> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver detalle de producto");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  await assertInventoryProductScope(product, ctx);

  const [balances, movements] = await Promise.all([
    getStockBalanceReport({ productId, includeZeroStock: true }, ctx),
    getStockMovementReport({ productId, ...filters }, ctx),
  ]);

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      status: product.status as string,
      description: product.description,
    },
    balancesByWarehouse: balances,
    movements,
  };
}

// ─── Warehouse Stock Detail ───────────────────────────────────────────────────

export async function getWarehouseStockDetail(
  warehouseId: string,
  filters: { dateFrom?: string; dateTo?: string },
  ctx: ServiceContext,
): Promise<WarehouseStockDetail> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver detalle de depósito");
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
  });
  if (!warehouse) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  await assertInventoryWarehouseScope(warehouse, ctx);

  const [balances, movements] = await Promise.all([
    getStockBalanceReport({ warehouseId, includeZeroStock: true }, ctx),
    getStockMovementReport({ warehouseId, ...filters }, ctx),
  ]);

  return {
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      type: warehouse.type as string,
      status: warehouse.status as string,
      address: warehouse.address,
    },
    balancesByProduct: balances,
    movements,
  };
}
