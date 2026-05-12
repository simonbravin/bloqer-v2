import { Prisma, prisma } from "@bloqer/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockBalanceEntry = {
  productId:   string;
  warehouseId: string;
  projectId:   string | null;
  quantity:    string;
};

export type StockBalanceResult = {
  productId:    string;
  warehouseId:  string;
  projectId:    string | null;
  wbsNodeId:    string | null;
  totalQuantity: string;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Returns aggregated confirmed stock balance for a given product/warehouse/tenant.
// CONFIRMED IN movements add; CONFIRMED OUT movements subtract.
// Cancelled movements are excluded.
export async function getStockBalance(filters: {
  tenantId:    string;
  warehouseId: string;
  productId:   string;
  projectId?:  string;
}): Promise<Prisma.Decimal> {
  const rows = await prisma.stockMovement.findMany({
    where: {
      tenantId:    filters.tenantId,
      warehouseId: filters.warehouseId,
      productId:   filters.productId,
      projectId:   filters.projectId ?? undefined,
      status:      "CONFIRMED",
    },
    select: { type: true, quantity: true },
  });

  let balance = new Prisma.Decimal(0);
  for (const row of rows) {
    if (row.type === "IN" || row.type === "TRANSFER_IN") {
      balance = balance.plus(row.quantity);
    } else if (row.type === "OUT" || row.type === "TRANSFER_OUT") {
      balance = balance.minus(row.quantity);
    }
    // ADJUSTMENT signs are handled explicitly in adjustment creation (not exposed in Phase 4C)
  }
  return balance;
}

export async function getStockBalanceByWarehouse(filters: {
  tenantId:    string;
  warehouseId: string;
  companyId?:  string;
}): Promise<StockBalanceResult[]> {
  const rows = await prisma.stockMovement.findMany({
    where: {
      tenantId:    filters.tenantId,
      warehouseId: filters.warehouseId,
      companyId:   filters.companyId ?? undefined,
      status:      "CONFIRMED",
    },
    select: { type: true, quantity: true, productId: true, warehouseId: true, projectId: true, wbsNodeId: true },
  });

  // Aggregate by product+warehouse+project+wbs
  const map = new Map<string, Prisma.Decimal>();
  const keyMeta = new Map<string, { productId: string; warehouseId: string; projectId: string | null; wbsNodeId: string | null }>();

  for (const row of rows) {
    const key = `${row.productId}|${row.warehouseId}|${row.projectId ?? ""}|${row.wbsNodeId ?? ""}`;
    const current = map.get(key) ?? new Prisma.Decimal(0);
    let delta = new Prisma.Decimal(0);
    if (row.type === "IN" || row.type === "TRANSFER_IN") delta = row.quantity;
    else if (row.type === "OUT" || row.type === "TRANSFER_OUT") delta = row.quantity.negated();
    map.set(key, current.plus(delta));
    if (!keyMeta.has(key)) {
      keyMeta.set(key, { productId: row.productId, warehouseId: row.warehouseId, projectId: row.projectId, wbsNodeId: row.wbsNodeId });
    }
  }

  return Array.from(map.entries())
    .filter(([, qty]) => qty.greaterThan(0))
    .map(([key, qty]) => ({
      ...keyMeta.get(key)!,
      totalQuantity: qty.toString(),
    }));
}

/** Aggregated confirmed balances &lt; 0 (per product/warehouse/project/WBS). For operational alerts. */
export async function listNegativeStockBalancesForTenant(params: { tenantId: string }): Promise<StockBalanceResult[]> {
  const rows = await prisma.stockMovement.findMany({
    where: {
      tenantId: params.tenantId,
      status:   "CONFIRMED",
    },
    select: { type: true, quantity: true, productId: true, warehouseId: true, projectId: true, wbsNodeId: true },
  });

  const map = new Map<string, Prisma.Decimal>();
  const keyMeta = new Map<string, { productId: string; warehouseId: string; projectId: string | null; wbsNodeId: string | null }>();

  for (const row of rows) {
    const key = `${row.productId}|${row.warehouseId}|${row.projectId ?? ""}|${row.wbsNodeId ?? ""}`;
    const current = map.get(key) ?? new Prisma.Decimal(0);
    let delta = new Prisma.Decimal(0);
    if (row.type === "IN" || row.type === "TRANSFER_IN") delta = row.quantity;
    else if (row.type === "OUT" || row.type === "TRANSFER_OUT") delta = row.quantity.negated();
    map.set(key, current.plus(delta));
    if (!keyMeta.has(key)) {
      keyMeta.set(key, { productId: row.productId, warehouseId: row.warehouseId, projectId: row.projectId, wbsNodeId: row.wbsNodeId });
    }
  }

  return Array.from(map.entries())
    .filter(([, qty]) => qty.lessThan(0))
    .map(([key, qty]) => ({
      ...keyMeta.get(key)!,
      totalQuantity: qty.toString(),
    }));
}
