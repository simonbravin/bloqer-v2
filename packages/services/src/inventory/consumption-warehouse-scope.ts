/**
 * Pure warehouse/product/project scope rules for manual stock consumption.
 * Mirrors purchase-receipt company matching; does not touch Prisma.
 */
export type ConsumptionWarehouseScopeInput = {
  warehouseCompanyId: string;
  warehouseProjectId: string | null;
  productCompanyId: string | null;
  consumptionProjectId: string | null;
  projectCompanyId: string | null;
};

export function consumptionWarehouseScopeConflict(
  input: ConsumptionWarehouseScopeInput,
): string | null {
  if (input.productCompanyId && input.productCompanyId !== input.warehouseCompanyId) {
    return "El producto no pertenece a la misma empresa que el depósito";
  }
  if (input.warehouseProjectId) {
    if (!input.consumptionProjectId || input.warehouseProjectId !== input.consumptionProjectId) {
      return "El depósito está asignado a otra obra";
    }
  }
  if (input.consumptionProjectId && input.projectCompanyId) {
    if (input.warehouseCompanyId !== input.projectCompanyId) {
      return "El depósito no pertenece a la misma empresa que la obra";
    }
  }
  return null;
}
