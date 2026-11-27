import { z } from "zod";
import { QUOTE_LINE_OFFER_KINDS } from "@bloqer/domain";
import { discountPctString, unitPriceString, ratePctString, positiveQtyString } from "./money";

export const supplierQuoteResponseSchema = z.object({
  version: z.literal(1),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  pricesIncludeTax: z.boolean(),
  iibbPerceptionRate: ratePctString.refine(value => !value.startsWith("-")),
  leadTimeDays: z.number().int().min(0).max(3650),
  validUntil: z.string().date(),
  notes: z.string().trim().max(2000),
  lines: z.array(z.object({
    purchaseRequestLineId: z.string().guid(),
    offerKind: z.enum(QUOTE_LINE_OFFER_KINDS),
    unitPrice: unitPriceString,
    taxRate: ratePctString.refine(value => !value.startsWith("-")),
    discountPct: discountPctString,
  }).strict()).min(1).max(200),
}).strict();

export const supplierQuoteRequestSnapshotSchema = z.object({
  version: z.literal(1),
  companyName: z.string(), projectName: z.string(), requestCode: z.string(), supplierName: z.string(),
  lines: z.array(z.object({ id: z.string().guid(), description: z.string(), quantity: positiveQtyString, unit: z.string() }).strict()).min(1).max(200),
}).strict();

export type SupplierQuoteResponse = z.infer<typeof supplierQuoteResponseSchema>;
export type SupplierQuoteRequestSnapshot = z.infer<typeof supplierQuoteRequestSnapshotSchema>;
