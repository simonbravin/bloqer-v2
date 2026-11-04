import { Prisma } from "@bloqer/database";
import { isBudgetDecimalWithinStorage } from "@bloqer/validators";
import { ServiceError } from "../types";

/**
 * Check the existing Decimal(18,4) capacity after the caller applies its business
 * scale. Preserve the value: this guard never clamps or regularizes stored data.
 */
export function assertBudgetDecimalFits(value: Prisma.Decimal | string | number, label: string): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  try { decimal = new Prisma.Decimal(value); }
  catch { throw new ServiceError("VALIDATION", `${label}: el valor debe ser un número finito`); }
  if (!decimal.isFinite() || !isBudgetDecimalWithinStorage(decimal.toString())) {
    throw new ServiceError("VALIDATION", `${label}: el valor supera la capacidad del presupuesto`);
  }
  return decimal;
}
