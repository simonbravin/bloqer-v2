import { Prisma } from "@bloqer/database";
import { resolveFxAmounts } from "@bloqer/utils";
import { ServiceError } from "../types";

export function computeDocumentFxAmounts(
  currency: string,
  totalAmount: Prisma.Decimal,
  fxRate?: Prisma.Decimal | null,
): { fxRate: Prisma.Decimal; amountArs: Prisma.Decimal } {
  try {
    const { fxRate: fx, amountArs } = resolveFxAmounts({
      currency,
      amount: totalAmount.toString(),
      fxRate: fxRate?.toString(),
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
