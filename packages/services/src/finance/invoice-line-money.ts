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
  /** Trusted persisted row, read within the update transaction. */
  previous?: {
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    discountPct: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTax: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  };
}): {
  unitPriceNet: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTax: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
} {
  const r = (() => {
    try {
      return resolveDocumentLineAmounts({
        quantity: serializeQtyDecimal(params.quantity),
        unitPrice: serializeUnitPriceDecimal(params.unitPrice),
        taxRatePercent: serializeRatePctDecimal(params.taxRate),
        discountPct: params.discountPct != null ? serializeRatePctDecimal(params.discountPct) : "0",
        pricesIncludeTax: params.pricesIncludeTax,
        previous: params.previous
          ? {
              quantity: params.previous.quantity.toString(),
              unitPrice: params.previous.unitPrice.toString(),
              taxRate: params.previous.taxRate.toString(),
              discountPct: params.previous.discountPct.toString(),
              lineSubtotal: params.previous.lineSubtotal.toFixed(2),
              lineTax: params.previous.lineTax.toFixed(2),
              lineTotal: params.previous.lineTotal.toFixed(2),
            }
          : undefined,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "DISCOUNT_PCT_OUT_OF_RANGE") {
        throw new ServiceError("VALIDATION", "El descuento debe estar entre 0 y 100");
      }
      throw new ServiceError("VALIDATION", "No se pudo calcular el importe de la línea");
    }
  })();
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

/** IDs only select rows already loaded from this document under its tenant guard. */
export function indexStoredDocumentLines<T extends { id: string }>(
  input: Array<{ id?: string }>,
  stored: T[],
): Map<string, T> {
  const byId = new Map(stored.map((line) => [line.id, line]));
  const seen = new Set<string>();
  for (const line of input) {
    if (!line.id) continue;
    if (!byId.has(line.id) || seen.has(line.id)) {
      throw new ServiceError(
        "CONFLICT",
        "Las líneas cambiaron o no pertenecen a este documento. Recargá e intentá de nuevo.",
      );
    }
    seen.add(line.id);
  }
  return byId;
}
