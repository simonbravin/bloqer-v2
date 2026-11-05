import type { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

/** D-130: spelling normalization only; no physical conversion or inferred aliases. */
export function normalizeProductUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

export function assertProductUnitCompatible(productUnit: string, documentUnit: string): void {
  const expected = normalizeProductUnit(productUnit);
  const actual = normalizeProductUnit(documentUnit);
  if (!expected || !actual || expected !== actual) {
    throw new ServiceError(
      "CONFLICT",
      "La unidad del documento no coincide con la del producto. Revisá el producto y la unidad del documento; no se convierten cantidades automáticamente.",
    );
  }
}

/** Share Product's unit-edit lock before reading units and creating any first reference. */
export async function lockProductsForUnitReferences(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  productIds: readonly string[],
  tenantId: string,
): Promise<void> {
  for (const id of [...new Set(productIds)].sort()) {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  }
}

export const productUnitReferencesInclude = {
  _count: {
    select: {
      purchaseRequestLines: true,
      purchaseOrderLines: true,
      costAnalysisLines: true,
      jobsiteLogMaterials: true,
      warehouseTransfers: true,
      stockMovements: true,
    },
  },
} as const satisfies Prisma.ProductInclude;

export function canEditProductUnit(counts: Record<string, number>): boolean {
  return Object.values(counts).every((count) => count === 0);
}
