import { Prisma } from "@bloqer/database";
import { computeObligationBalanceDue, normalizeObligationBalanceDue } from "../finance/obligation-balance";

/** Technical input bound; not a policy about collection terms. */
export const MAX_COLLECTION_DELAY_DAYS = 3_650;

export function parseCollectionDelayDays(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) {
    throw new Error(`Ingresá un atraso entero entre 0 y ${MAX_COLLECTION_DELAY_DAYS} días.`);
  }
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 0 || days > MAX_COLLECTION_DELAY_DAYS) {
    throw new Error(`Ingresá un atraso entero entre 0 y ${MAX_COLLECTION_DELAY_DAYS} días.`);
  }
  return days;
}

/** D-150: overdue dates start today; future dates keep their contractual due date. */
export function hypotheticalCollectionDate(dueDate: Date, today: string, delayDays: number): Date {
  const due = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()));
  const reference = new Date(`${today}T00:00:00.000Z`);
  const shifted = due < reference ? reference : due;
  shifted.setUTCDate(shifted.getUTCDate() + delayDays);
  return shifted;
}

type ScenarioReceivable = {
  dueDate: Date;
  originalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  creditedAmount: Prisma.Decimal;
};

/** Same authorized current balances as the base; never adds money or changes real dates. */
export function computeDelayedReceivables(
  receivables: ScenarioReceivable[], asOfDate: string, today: string, delayDays: number,
) {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
  let included = new Prisma.Decimal(0);
  let deferred = new Prisma.Decimal(0);
  let deferredCount = 0;
  for (const row of receivables) {
    if (row.dueDate > asOf) continue;
    const balance = normalizeObligationBalanceDue(computeObligationBalanceDue(row.originalAmount, row.paidAmount, row.creditedAmount));
    if (balance.lessThanOrEqualTo(0)) continue;
    if (hypotheticalCollectionDate(row.dueDate, today, delayDays) <= asOf) included = included.plus(balance);
    else {
      deferred = deferred.plus(balance);
      deferredCount += 1;
    }
  }
  return { included, deferred, deferredCount };
}

/** Capital proyectado = cobros − pagos + CxC − CxP (saldos abiertos con vencimiento ≤ fecha). */
export function computeProjectedCapital(
  collectionsReceived: Prisma.Decimal,
  paymentsMade: Prisma.Decimal,
  receivablesDue: Prisma.Decimal,
  payablesDue: Prisma.Decimal,
): Prisma.Decimal {
  return collectionsReceived.minus(paymentsMade).plus(receivablesDue).minus(payablesDue);
}
