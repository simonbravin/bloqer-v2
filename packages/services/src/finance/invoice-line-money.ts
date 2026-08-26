import { Prisma } from "@bloqer/database";
import { normalizeDiscountPct, resolveDocumentLineAmounts } from "@bloqer/utils";
import { ServiceError } from "../types";
import {
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
} from "./money-decimal";

/**
 * Resolve persisted unit price (list net) + line money components ([D-053] / [D-086] / [D-093]).
 * When `pricesIncludeTax`, `unitPrice` is treated as gross (Factura B precio final);
 * discount still applies on the extracted list net.
 */
export function resolveInvoiceLineMoney(params: {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  discountPct?: Prisma.Decimal;
  pricesIncludeTax?: boolean;
}): {
  unitPriceNet: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTax: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
} {
  const r = resolveDocumentLineAmounts({
    quantity: serializeQtyDecimal(params.quantity),
    unitPrice: serializeUnitPriceDecimal(params.unitPrice),
    taxRatePercent: serializeRatePctDecimal(params.taxRate),
    discountPct: params.discountPct != null ? serializeRatePctDecimal(params.discountPct) : "0",
    pricesIncludeTax: params.pricesIncludeTax,
  });
  return {
    unitPriceNet: new Prisma.Decimal(r.unitPriceNet),
    lineSubtotal: new Prisma.Decimal(r.lineSubtotal),
    lineTax: new Prisma.Decimal(r.lineTax),
    lineTotal: new Prisma.Decimal(r.lineTotal),
  };
}

export function parseDiscountPct(raw?: string | null): Prisma.Decimal {
  try {
    return new Prisma.Decimal(normalizeDiscountPct(raw));
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "DISCOUNT_PCT_OUT_OF_RANGE") {
      throw new ServiceError("VALIDATION", "El descuento debe estar entre 0 y 100");
    }
    throw new ServiceError("VALIDATION", "Porcentaje de descuento inválido");
  }
}
