import { Prisma, prisma } from "@bloqer/database";
import { serializeQtyDecimal } from "../finance/money-decimal";
import { ServiceError } from "../types";
import {
  assertInventoryMovementParentScope,
  inventoryMovementParentInclude,
  type InventoryMovementWithParents,
} from "./inventory-scope";

export type StockBalanceEntry = {
  productId: string;
  warehouseId: string;
  projectId: string | null;
  quantity: string;
};
export type StockBalanceResult = {
  productId: string;
  warehouseId: string;
  companyId: string;
  projectId: string | null;
  wbsNodeId: string | null;
  totalQuantity: string;
};
type StockBalanceDb = {
  stockMovement: { findMany: typeof prisma.stockMovement.findMany };
  $queryRaw?: typeof prisma.$queryRaw;
};
type StockLockTx = { $queryRaw: typeof prisma.$queryRaw };
/** Acquire warehouses in sorted order before products when locking more than one key. */
export async function lockStockBalanceKey(
  tx: StockLockTx,
  warehouseId: string,
  productId: string,
): Promise<void> {
  await lockStockBalanceKeys(tx, [{ warehouseId, productId }]);
}
export async function lockStockBalanceKeys(
  tx: StockLockTx,
  keys: Array<{ warehouseId: string; productId: string }>,
): Promise<void> {
  for (const warehouseId of [...new Set(keys.map((key) => key.warehouseId))].sort())
    await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${warehouseId} FOR UPDATE`;
  for (const productId of [...new Set(keys.map((key) => key.productId))].sort())
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
}
export function stockMovementQuantityDelta(row: {
  type: string;
  quantity: Prisma.Decimal;
}): Prisma.Decimal {
  // No adjustment writer or signed-direction rule exists in this phase (D-083).
  // Preserve its historical exclusion; reports expose the unknown direction separately.
  if (row.type === "ADJUSTMENT") return new Prisma.Decimal(0);
  if (!row.quantity.isFinite() || row.quantity.lte(0))
    throw new ServiceError("CONFLICT", "El movimiento tiene cantidad inválida");
  if (row.type === "IN" || row.type === "TRANSFER_IN") return row.quantity;
  if (row.type === "OUT" || row.type === "TRANSFER_OUT") return row.quantity.negated();
  throw new ServiceError("CONFLICT", "El tipo de movimiento no permite calcular el saldo físico");
}
/** Physical stock is product + warehouse; project/WBS attribution never splits availability. */
export async function getStockBalance(
  filters: { tenantId: string; warehouseId: string; productId: string; projectId?: string },
  db: StockBalanceDb = prisma,
): Promise<Prisma.Decimal> {
  const rows = await db.stockMovement.findMany({
    where: {
      tenantId: filters.tenantId,
      warehouseId: filters.warehouseId,
      productId: filters.productId,
      status: "CONFIRMED",
    },
    include: inventoryMovementParentInclude,
  });
  let balance = new Prisma.Decimal(0);
  for (const row of rows) {
    assertInventoryMovementParentScope(row);
    balance = balance.plus(stockMovementQuantityDelta(row));
  }
  return balance;
}
function aggregate(rows: InventoryMovementWithParents[]): StockBalanceResult[] {
  const map = new Map<string, { first: InventoryMovementWithParents; quantity: Prisma.Decimal }>();
  for (const row of rows) {
    assertInventoryMovementParentScope(row);
    const key = row.warehouseId + ":" + row.productId;
    const existing = map.get(key);
    if (existing && existing.first.companyId !== row.companyId)
      throw new ServiceError("CONFLICT", "El saldo tiene relaciones de empresa inconsistentes");
    if (existing) existing.quantity = existing.quantity.plus(stockMovementQuantityDelta(row));
    else map.set(key, { first: row, quantity: stockMovementQuantityDelta(row) });
  }
  return [...map.values()].map(({ first, quantity }) => ({
    productId: first.productId,
    warehouseId: first.warehouseId,
    companyId: first.companyId,
    projectId: first.warehouse.projectId,
    wbsNodeId: null,
    totalQuantity: serializeQtyDecimal(quantity),
  }));
}
export async function getStockBalanceByWarehouse(filters: {
  tenantId: string;
  warehouseId: string;
  companyId?: string;
}): Promise<StockBalanceResult[]> {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: filters.warehouseId, tenantId: filters.tenantId },
  });
  if (!warehouse) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (filters.companyId && filters.companyId !== warehouse.companyId)
    throw new ServiceError("FORBIDDEN", "Depósito de otra empresa");
  const rows = await prisma.stockMovement.findMany({
    where: { tenantId: filters.tenantId, warehouseId: filters.warehouseId, status: "CONFIRMED" },
    include: inventoryMovementParentInclude,
  });
  return aggregate(rows).filter((row) => new Prisma.Decimal(row.totalQuantity).gt(0));
}
export async function listNegativeStockBalancesForTenant(params: {
  tenantId: string;
}): Promise<StockBalanceResult[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { tenantId: params.tenantId, status: "CONFIRMED" },
    include: inventoryMovementParentInclude,
  });
  return aggregate(rows).filter((row) => new Prisma.Decimal(row.totalQuantity).lt(0));
}
