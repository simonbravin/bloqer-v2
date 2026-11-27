import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@bloqer/database";
import { supplierQuoteResponseSchema, type SupplierQuoteRequestSnapshot } from "@bloqer/validators";
import { resolveDocumentLineAmounts } from "@bloqer/utils";
import { ServiceError } from "../types";

export const QUOTE_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const QUOTE_INVITATION_UNAVAILABLE = "El enlace no está disponible. Pedí un nuevo enlace a Compras.";
export function quoteInvitationDigest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function newQuoteInvitationToken(): string { return randomBytes(32).toString("hex"); }
export function assertQuoteInvitationOpen(row: { expiresAt: Date; revokedAt: Date | null }, now = new Date()) {
  if (row.revokedAt || row.expiresAt <= now) throw new ServiceError("NOT_FOUND", QUOTE_INVITATION_UNAVAILABLE);
}

/** Server validates the exact requested lines and canonical D-118 arithmetic before storing evidence. */
export function validateSupplierQuoteResponse(raw: unknown, snapshot: SupplierQuoteRequestSnapshot) {
  const parsed = supplierQuoteResponseSchema.safeParse(raw);
  if (!parsed.success) throw new ServiceError("VALIDATION", "Completá moneda, vigencia, plazo, impuestos y todos los renglones.");
  const response = parsed.data;
  const byId = new Map(response.lines.map(line => [line.purchaseRequestLineId, line]));
  if (byId.size !== response.lines.length || byId.size !== snapshot.lines.length) throw new ServiceError("VALIDATION", "Incluí cada ítem solicitado una sola vez.");
  let positive = false;
  const lines = snapshot.lines.map(requested => {
    const line = byId.get(requested.id);
    if (!line) throw new ServiceError("VALIDATION", "Un ítem no pertenece a esta solicitud.");
    const amount = resolveDocumentLineAmounts({ quantity: requested.quantity, unitPrice: line.unitPrice, taxRatePercent: line.taxRate, discountPct: line.discountPct, pricesIncludeTax: response.pricesIncludeTax });
    const total = new Prisma.Decimal(amount.lineTotal);
    if (line.offerKind === "QUOTED" && !total.greaterThan(0)) throw new ServiceError("VALIDATION", "Un ítem cotizado debe tener importe positivo.");
    if (line.offerKind !== "QUOTED" && !total.isZero()) throw new ServiceError("VALIDATION", "Los ítems no cotizados o bonificados deben tener importe cero.");
    if (line.offerKind === "NOT_QUOTED" && (!new Prisma.Decimal(line.unitPrice).isZero() || !new Prisma.Decimal(line.discountPct).isZero())) throw new ServiceError("VALIDATION", "No cotizado requiere precio y descuento cero.");
    if (line.offerKind === "QUOTED") positive = true;
    return line;
  });
  if (!positive) throw new ServiceError("VALIDATION", "Debe haber al menos un ítem cotizado con importe positivo.");
  return { ...response, lines };
}
