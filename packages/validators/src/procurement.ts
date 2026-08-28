import { z } from "zod";
import { idempotencyKeySchema } from "./idempotency";
import { costCategorySchema } from "./budget";
import { isPositiveRoundedQty, positiveQtyString, qtyString, unitPriceString, discountPctString } from "./money";

const purchaseOrderLineSchema = z.object({
  wbsNodeId: z.string().uuid({ message: "Cada línea debe imputar a un ítem EDT" }),
  productId: z.string().uuid().optional().nullable(),
  /** Optional APU hint ([D-068]); does not change EDT imputation. */
  costAnalysisLineId: z.string().uuid().optional().nullable(),
  /** Job-cost nature ([D-099]). Defaults to APU category or MATERIAL in the service. */
  costType: costCategorySchema.optional().nullable(),
  description: z.string().min(1, "Descripción requerida"),
  unit: z.string().default(""),
  quantity: positiveQtyString,
  unitPrice: unitPriceString,
  taxRate: z.string().regex(/^\d+(\.\d+)?$/).default("21"),
  discountPct: discountPctString.optional().default("0.0000"),
  sortOrder: z.number().int().default(0),
  varianceJustification: z.string().max(2000).optional().nullable(),
});

export const createPurchaseOrderSchema = z.object({
  projectId: z.string().uuid(),
  supplierContactId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  currency: z.string().length(3).default("ARS"),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  emergencyReason: z.string().max(2000).optional().nullable(),
  lines: z.array(purchaseOrderLineSchema).min(1, "Debe tener al menos una línea"),
});

export const updatePurchaseOrderSchema = z.object({
  supplierContactId: z.string().uuid().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  emergencyReason: z.string().max(2000).optional().nullable(),
  lines: z.array(purchaseOrderLineSchema).min(1).optional(),
});

export const returnPurchaseOrderSchema = z.object({
  reason: z.string().min(3, "Indicá el motivo de la devolución").max(2000),
});

const receiptLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  quantityReceived: qtyString.refine(
    isPositiveRoundedQty,
    "La cantidad recibida debe ser mayor a cero",
  ),
  notes: z.string().optional().nullable(),
});

export const createPurchaseReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid().optional().nullable(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
  lines: z.array(receiptLineSchema).min(1, "Debe incluir al menos una línea"),
  idempotencyKey: idempotencyKeySchema,
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type ReturnPurchaseOrderInput = z.infer<typeof returnPurchaseOrderSchema>;
export type CreatePurchaseReceiptInput = z.infer<typeof createPurchaseReceiptSchema>;
