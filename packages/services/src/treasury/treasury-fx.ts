import { Prisma } from "@bloqer/database";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { ServiceError } from "../types";

type FxSnapshot = {
  fxRate: Prisma.Decimal;
  amountArs: Prisma.Decimal;
};

/** Currency comes from the account, never from an editable form field. */
export function computeTreasuryFxSnapshot(
  currency: string,
  amount: Prisma.Decimal,
  fxRate: string | undefined,
): FxSnapshot {
  const snapshot = computeDocumentFxAmounts(currency, amount, fxRate ? new Prisma.Decimal(fxRate) : undefined);
  // Decimal(18,4) for amounts and Decimal(18,6) for the rate.
  const amountFits = (value: Prisma.Decimal) => value.abs().lessThan("100000000000000");
  if (!amountFits(amount) || !amountFits(snapshot.amountArs) || snapshot.fxRate.greaterThanOrEqualTo("1000000000000")) {
    throw new ServiceError("VALIDATION", "El importe o el tipo de cambio excede la precisión admitida");
  }
  return snapshot;
}

export function treasuryFxReplayMatches(
  existing: {
    currency: string;
    fxRate: Prisma.Decimal | null;
    amountArs: Prisma.Decimal | null;
  },
  snapshot: FxSnapshot,
): boolean {
  // Pre-snapshot ARS has an identity conversion. Unknown historic FX is never inferred.
  if (existing.fxRate === null && existing.amountArs === null) {
    return existing.currency.trim().toUpperCase() === "ARS" && snapshot.fxRate.equals(1);
  }
  return existing.fxRate?.equals(snapshot.fxRate) === true &&
    existing.amountArs?.equals(snapshot.amountArs) === true;
}
