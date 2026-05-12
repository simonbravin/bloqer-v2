import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function movementSignedQty(type: string, qty: Prisma.Decimal): Prisma.Decimal {
  if (type === "IN" || type === "TRANSFER_IN")  return qty;
  if (type === "OUT" || type === "TRANSFER_OUT") return qty.negated();
  return qty; // ADJUSTMENT: raw stored quantity, no sign assumed
}

const SOURCE_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Recepción de compra",
  CONSUMPTION:      "Consumo",
  TRANSFER:         "Transferencia",
  ADJUSTMENT:       "Ajuste",
  OPENING_BALANCE:  "Saldo inicial",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockBalanceRow = {
  productId:         string;
  productSku:        string;
  productName:       string;
  productUnit:       string;
  warehouseId:       string;
  warehouseName:     string;
  companyId:         string;
  companyName:       string;
  projectId:         string | null;
  projectName:       string | null;
  quantityOnHand:    string;
  quantityReserved:  null;
  quantityAvailable: string;
  lastMovementDate:  string | null;
  flags: {
    zeroStock:         boolean;
    negativeStock:     boolean;
    adjustmentPresent: boolean;
  };
};

export type StockMovementReportRow = {
  id:             string;
  movementDate:   string;
  productId:      string;
  productSku:     string;
  productName:    string;
  productUnit:    string;
  warehouseId:    string;
  warehouseName:  string;
  projectId:      string | null;
  projectName:    string | null;
  wbsNodeId:      string | null;
  wbsNodeName:    string | null;
  type:           string;
  sourceType:     string;
  sourceLabel:    string;
  quantity:       string;
  signedQuantity: string;
  unitCost:       string | null;
  totalCost:      string | null;
  notes:          string | null;
};

export type ProductStockDetail = {
  product: {
    id:          string;
    sku:         string;
    name:        string;
    unit:        string;
    status:      string;
    description: string | null;
  };
  balancesByWarehouse: StockBalanceRow[];
  movements:           StockMovementReportRow[];
};

export type WarehouseStockDetail = {
  warehouse: {
    id:      string;
    name:    string;
    type:    string;
    status:  string;
    address: string | null;
  };
  balancesByProduct: StockBalanceRow[];
  movements:         StockMovementReportRow[];
};

// ─── Filters ──────────────────────────────────────────────────────────────────

export type StockBalanceFilters = {
  warehouseId?:    string;
  productId?:      string;
  companyId?:      string;
  projectId?:      string;
  includeZeroStock?: boolean;
};

export type StockMovementReportFilters = {
  warehouseId?:  string;
  productId?:    string;
  projectId?:    string;
  wbsNodeId?:    string;
  companyId?:    string;
  sourceType?:   string;
  movementType?: string;
  dateFrom?:     string;
  dateTo?:       string;
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

  const movements = await prisma.stockMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      status:   "CONFIRMED",
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.productId   ? { productId:   filters.productId   } : {}),
      ...(filters.companyId   ? { companyId:   filters.companyId   } : {}),
      ...(filters.projectId   ? { warehouse:   { projectId: filters.projectId } } : {}),
    },
    select: {
      productId:    true,
      warehouseId:  true,
      companyId:    true,
      type:         true,
      quantity:     true,
      movementDate: true,
      product:   { select: { name: true, sku: true, unit: true } },
      warehouse: { select: { name: true, projectId: true, project: { select: { name: true } } } },
      company:   { select: { name: true } },
    },
  });

  type Acc = {
    productId: string; productSku: string; productName: string; productUnit: string;
    warehouseId: string; warehouseName: string;
    companyId: string; companyName: string;
    projectId: string | null; projectName: string | null;
    balance: Prisma.Decimal;
    lastMovementDate: Date | null;
    adjustmentPresent: boolean;
  };

  const map = new Map<string, Acc>();

  for (const m of movements) {
    const key = `${m.productId}|${m.warehouseId}`;
    if (!map.has(key)) {
      map.set(key, {
        productId:         m.productId,
        productSku:        m.product.sku,
        productName:       m.product.name,
        productUnit:       m.product.unit,
        warehouseId:       m.warehouseId,
        warehouseName:     m.warehouse.name,
        companyId:         m.companyId,
        companyName:       m.company.name,
        projectId:         m.warehouse.projectId,
        projectName:       m.warehouse.project?.name ?? null,
        balance:           new Prisma.Decimal(0),
        lastMovementDate:  null,
        adjustmentPresent: false,
      });
    }
    const acc = map.get(key)!;

    if (m.type === "IN" || m.type === "TRANSFER_IN") {
      acc.balance = acc.balance.plus(m.quantity);
    } else if (m.type === "OUT" || m.type === "TRANSFER_OUT") {
      acc.balance = acc.balance.minus(m.quantity);
    } else if (m.type === "ADJUSTMENT") {
      acc.adjustmentPresent = true;
      // excluded from balance — sign convention pending manual adjustment module
    }

    if (!acc.lastMovementDate || m.movementDate > acc.lastMovementDate) {
      acc.lastMovementDate = m.movementDate;
    }
  }

  const rows: StockBalanceRow[] = [];
  for (const acc of map.values()) {
    const isZero = acc.balance.equals(0);
    const isNeg  = acc.balance.lessThan(0);
    // Always include negative stock; exclude zero stock unless includeZeroStock is true
    if (isZero && !isNeg && !filters.includeZeroStock) continue;
    rows.push({
      productId:         acc.productId,
      productSku:        acc.productSku,
      productName:       acc.productName,
      productUnit:       acc.productUnit,
      warehouseId:       acc.warehouseId,
      warehouseName:     acc.warehouseName,
      companyId:         acc.companyId,
      companyName:       acc.companyName,
      projectId:         acc.projectId,
      projectName:       acc.projectName,
      quantityOnHand:    acc.balance.toString(),
      quantityReserved:  null,
      quantityAvailable: acc.balance.toString(),
      lastMovementDate:  acc.lastMovementDate?.toISOString().slice(0, 10) ?? null,
      flags: { zeroStock: isZero, negativeStock: isNeg, adjustmentPresent: acc.adjustmentPresent },
    });
  }

  return rows.sort((a, b) =>
    a.productName.localeCompare(b.productName) || a.warehouseName.localeCompare(b.warehouseName)
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

  const rows = await prisma.stockMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      status:   "CONFIRMED",
      ...(filters.warehouseId  ? { warehouseId: filters.warehouseId               } : {}),
      ...(filters.productId    ? { productId:   filters.productId                 } : {}),
      ...(filters.projectId    ? { projectId:   filters.projectId                 } : {}),
      ...(filters.wbsNodeId    ? { wbsNodeId:   filters.wbsNodeId                 } : {}),
      ...(filters.companyId    ? { companyId:   filters.companyId                 } : {}),
      ...(filters.sourceType   ? { sourceType:  filters.sourceType   as never     } : {}),
      ...(filters.movementType ? { type:        filters.movementType as never     } : {}),
      ...((filters.dateFrom || filters.dateTo) ? {
        movementDate: {
          ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
          ...(filters.dateTo   ? { lte: new Date(filters.dateTo)   } : {}),
        },
      } : {}),
    },
    include: {
      product:   { select: { name: true, sku: true, unit: true } },
      warehouse: { select: { name: true } },
      project:   { select: { name: true } },
      wbsNode:   { select: { name: true } },
    },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((m) => ({
    id:             m.id,
    movementDate:   m.movementDate.toISOString().slice(0, 10),
    productId:      m.productId,
    productSku:     m.product.sku,
    productName:    m.product.name,
    productUnit:    m.product.unit,
    warehouseId:    m.warehouseId,
    warehouseName:  m.warehouse.name,
    projectId:      m.projectId,
    projectName:    m.project?.name ?? null,
    wbsNodeId:      m.wbsNodeId,
    wbsNodeName:    m.wbsNode?.name ?? null,
    type:           m.type as string,
    sourceType:     m.sourceType as string,
    sourceLabel:    SOURCE_LABELS[m.sourceType as string] ?? (m.sourceType as string),
    quantity:       m.quantity.toString(),
    signedQuantity: movementSignedQty(m.type as string, m.quantity).toString(),
    unitCost:       m.unitCost?.toString()   ?? null,
    totalCost:      m.totalCost?.toString()  ?? null,
    notes:          m.notes,
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
    where:  { id: productId },
    select: { id: true, sku: true, name: true, unit: true, status: true, description: true, tenantId: true },
  });
  if (!product) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  if (product.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const [balances, movements] = await Promise.all([
    getStockBalanceReport({ productId, includeZeroStock: true }, ctx),
    getStockMovementReport({ productId, ...filters }, ctx),
  ]);

  return {
    product: {
      id:          product.id,
      sku:         product.sku,
      name:        product.name,
      unit:        product.unit,
      status:      product.status as string,
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
    where:  { id: warehouseId },
    select: { id: true, name: true, type: true, status: true, address: true, tenantId: true },
  });
  if (!warehouse) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (warehouse.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const [balances, movements] = await Promise.all([
    getStockBalanceReport({ warehouseId, includeZeroStock: true }, ctx),
    getStockMovementReport({ warehouseId, ...filters }, ctx),
  ]);

  return {
    warehouse: {
      id:      warehouse.id,
      name:    warehouse.name,
      type:    warehouse.type as string,
      status:  warehouse.status as string,
      address: warehouse.address,
    },
    balancesByProduct: balances,
    movements,
  };
}
