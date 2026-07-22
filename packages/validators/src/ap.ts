import { z } from "zod";
import {
  fxRateString,
  moneyAmountString,
  optionalFxRateString,
  optionalMoneyAmountString,
  positiveMoneyAmountString,
  qtyString,
  ratePctString,
} from "./money";

const supplierInvoiceLineSchema = z.object({
  description: z.string().min(1, "Descripción requerida"),
  quantity:    qtyString,
  unitPrice:   moneyAmountString,
  taxRate:     ratePctString.optional().default("0.0000"),
  sortOrder:   z.number().int().min(0).optional().default(0),
});

/** projectId null/omit = company-level AP (Phase 16B). Project routes must still pass projectId from URL. */
export const createSupplierInvoiceSchema = z.object({
  projectId:         z.string().uuid().optional().nullable(),
  supplierContactId: z.string().uuid(),
  issueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency:          z.string().length(3).default("ARS"),
  fxRate:            optionalFxRateString,
  notes:             z.string().optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
  purchaseOrderId:   z.string().uuid().optional().nullable(),
  lines:             z.array(supplierInvoiceLineSchema).min(1, "Debe tener al menos una línea"),
});

export const updateSupplierInvoiceSchema = z.object({
  supplierContactId: z.string().uuid().optional(),
  issueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fxRate:            optionalFxRateString,
  notes:             z.string().optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
  purchaseOrderId:   z.string().uuid().optional().nullable(),
  lines:             z.array(supplierInvoiceLineSchema).min(1).optional(),
});

export const createPaymentFieldsSchema = z.object({
  payableId:      z.string().uuid(),
  accountId:      z.string().uuid(),
  paymentDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:         optionalMoneyAmountString,
  /** Server applies stored balanceDue — [D-053]. */
  payFullBalance: z.boolean().optional(),
  notes:          z.string().optional().nullable(),
});

export const createPaymentSchema = createPaymentFieldsSchema.superRefine((val, ctx) => {
  if (!val.payFullBalance && val.amount == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Monto inválido",
      path: ["amount"],
    });
  }
});

export const payNowSchema = z.object({
  accountId:      z.string().uuid(),
  paymentDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:         optionalMoneyAmountString,
  /** When true or amount omitted, server pays stored invoice total ([D-053]). */
  payFullBalance: z.boolean().optional(),
  notes:          z.string().optional().nullable(),
});

/** Corporate or project AP composite flow ([D-052]). */
export const registerApExpenseSchema = createSupplierInvoiceSchema.extend({
  payNow: payNowSchema.optional(),
});

export type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
export type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>;
export type CreatePaymentInput         = z.infer<typeof createPaymentSchema>;
export type RegisterApExpenseInput     = z.infer<typeof registerApExpenseSchema>;

export const createSupplierInvoiceFromPurchaseOrderSchema = z.object({
  projectId:          z.string().uuid(),
  purchaseOrderId:    z.string().uuid(),
  purchaseReceiptId:  z.string().uuid().optional().nullable(),
  basis:              z.enum(["received", "remaining"]).optional().default("received"),
});

export type CreateSupplierInvoiceFromPurchaseOrderInput = z.infer<
  typeof createSupplierInvoiceFromPurchaseOrderSchema
>;

// Re-export money helpers used by AP forms/tests
export { moneyAmountString, positiveMoneyAmountString, fxRateString, qtyString, ratePctString };
