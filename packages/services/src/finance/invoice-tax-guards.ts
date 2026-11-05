import type { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

/** D-133: validate new tax effects without rewriting any historical document. */
export function assertNonnegativeInvoiceTaxes(invoice: {
  taxAmount: Prisma.Decimal;
  iibbPerceptionRate: Prisma.Decimal;
  iibbPerceptionAmount: Prisma.Decimal;
  lines: ReadonlyArray<{ taxRate: Prisma.Decimal; lineTax?: Prisma.Decimal }>;
}): void {
  if (invoice.taxAmount.lt(0) || invoice.iibbPerceptionRate.lt(0) || invoice.iibbPerceptionAmount.lt(0) ||
      invoice.lines.some(line => line.taxRate.lt(0) || line.lineTax?.lt(0))) {
    throw new ServiceError("VALIDATION", "IVA y percepción IIBB no pueden ser negativos. Corregí los valores del nuevo documento o borrador antes de emitir.");
  }
}
