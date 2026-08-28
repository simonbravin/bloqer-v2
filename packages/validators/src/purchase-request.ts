import { z } from "zod";
import { positiveQtyString, discountPctString, unitPriceString } from "./money";

const purchaseRequestLineSchema = z.object({
  wbsNodeId: z.string().uuid({ message: "Cada línea debe imputar a un ítem EDT" }),
  productId: z.string().uuid().optional().nullable(),
  /** Optional APU hint ([D-068]); does not change EDT imputation. */
  costAnalysisLineId: z.string().uuid().optional().nullable(),
  lineType: z.enum(["MATERIAL", "SERVICE", "OTHER"]).default("MATERIAL"),
  description: z.string().min(1, "Descripción requerida"),
  unit: z.string().default(""),
  quantity: positiveQtyString,
  sortOrder: z.number().int().default(0),
});

export const createPurchaseRequestSchema = z.object({
  projectId: z.string().uuid(),
  neededByDate: z
    .string({ required_error: "La fecha requerida es obligatoria" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: "La fecha requerida es obligatoria",
    }),
  notes: z.string().optional().nullable(),
  lines: z.array(purchaseRequestLineSchema).min(1, "Debe tener al menos una línea"),
});

export const updatePurchaseRequestSchema = z.object({
  neededByDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(purchaseRequestLineSchema).min(1).optional(),
});

const quoteLineSchema = z.object({
  purchaseRequestLineId: z.string().uuid(),
  unitPrice: unitPriceString,
  taxRate: z.string().regex(/^\d+(\.\d+)?$/).default("21"),
  discountPct: discountPctString.optional().default("0.0000"),
  sortOrder: z.number().int().default(0),
});

export const createProcurementQuoteSchema = z.object({
  purchaseRequestId: z.string().uuid(),
  supplierContactId: z.string().uuid(),
  currency: z.string().length(3).default("ARS"),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(quoteLineSchema).min(1),
});

export const confirmPurchaseOrderSchema = z.object({
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});

export type CreatePurchaseRequestInput = z.infer<typeof createPurchaseRequestSchema>;
export type UpdatePurchaseRequestInput = z.infer<typeof updatePurchaseRequestSchema>;
export type CreateProcurementQuoteInput = z.infer<typeof createProcurementQuoteSchema>;
