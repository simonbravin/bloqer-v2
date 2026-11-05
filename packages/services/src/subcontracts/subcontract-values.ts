import { Prisma } from "@bloqer/database";
import type { z } from "zod";
import { toMoneyDecimal } from "../finance/money-decimal";
import { ServiceError } from "../types";

export function parseSubcontractInput<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  return parsed.data;
}

export function subcontractLineTotal(
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
): Prisma.Decimal {
  if (
    !quantity.isFinite() ||
    !unitPrice.isFinite() ||
    quantity.lessThan(0) ||
    unitPrice.lessThan(0)
  )
    throw new ServiceError(
      "VALIDATION",
      "La cantidad y el precio deben ser decimales no negativos",
    );
  const total = toMoneyDecimal(quantity.times(unitPrice));
  if (!total.isFinite() || total.abs().greaterThan("99999999999999.9999"))
    throw new ServiceError("VALIDATION", "El importe supera la capacidad del subcontrato");
  return total;
}

export function assertSubcontractDateRange(start: Date | null, end: Date | null): void {
  if (start && end && start.getTime() > end.getTime())
    throw new ServiceError("VALIDATION", "La fecha de fin debe ser igual o posterior al inicio");
}

export function assertSubcontractQuantityWithinBalance(
  current: Prisma.Decimal,
  certified: Prisma.Decimal,
  maximum: Prisma.Decimal,
): void {
  if (
    !current.isFinite() ||
    !certified.isFinite() ||
    !maximum.isFinite() ||
    maximum.lessThan(0) ||
    current.lessThanOrEqualTo(0) ||
    certified.lessThan(0) ||
    certified.plus(current).greaterThan(maximum)
  )
    throw new ServiceError(
      "CONFLICT",
      "La cantidad a certificar supera el saldo disponible del subcontrato. Revisá las certificaciones vigentes.",
    );
}
