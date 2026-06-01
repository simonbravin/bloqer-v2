import { Prisma } from "@bloqer/database";

/** Capital proyectado = cobros − pagos + CxC − CxP (saldos abiertos con vencimiento ≤ fecha). */
export function computeProjectedCapital(
  collectionsReceived: Prisma.Decimal,
  paymentsMade: Prisma.Decimal,
  receivablesDue: Prisma.Decimal,
  payablesDue: Prisma.Decimal,
): Prisma.Decimal {
  return collectionsReceived.minus(paymentsMade).plus(receivablesDue).minus(payablesDue);
}
