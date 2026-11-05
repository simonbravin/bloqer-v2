import { Prisma } from "@bloqer/database";
import { resolveFxAmounts } from "@bloqer/utils";
import { ServiceError } from "../types";
import { serializeFxRateDecimal, serializeMoneyDecimal } from "./money-decimal";

export function computeDocumentFxAmounts(
  currency: string,
  totalAmount: Prisma.Decimal,
  fxRate?: Prisma.Decimal | null,
): { fxRate: Prisma.Decimal; amountArs: Prisma.Decimal } {
  try {
    const { fxRate: fx, amountArs } = resolveFxAmounts({
      currency,
      amount: serializeMoneyDecimal(totalAmount),
      fxRate: fxRate != null ? serializeFxRateDecimal(fxRate) : undefined,
    });
    return { fxRate: new Prisma.Decimal(fx), amountArs: new Prisma.Decimal(amountArs) };
  } catch (e) {
    if (e instanceof Error && e.message === "FX_RATE_REQUIRED") {
      throw new ServiceError(
        "VALIDATION",
        "Ingresá el tipo de cambio (ARS por 1 unidad de moneda) para comprobantes en moneda extranjera.",
      );
    }
    throw e;
  }
}

/** D-142: use a document's historical FX only if it reproduces its stored gross equivalent. */
export function verifiedDocumentAmountArs(
  doc: { currency: string; fxRate: Prisma.Decimal; amountArs: Prisma.Decimal; totalAmount: Prisma.Decimal },
  amount: Prisma.Decimal,
): Prisma.Decimal | null {
  const currency = doc.currency.trim().toUpperCase();
  if (currency === "ARS" || amount.isZero()) return new Prisma.Decimal(serializeMoneyDecimal(amount));
  if (!/^[A-Z]{3}$/.test(currency) || !doc.fxRate.gt(0) || doc.totalAmount.isZero()) return null;
  const expected = computeDocumentFxAmounts(currency, doc.totalAmount, doc.fxRate);
  if (!expected.amountArs.eq(doc.amountArs)) return null;
  return computeDocumentFxAmounts(currency, amount, expected.fxRate).amountArs;
}
