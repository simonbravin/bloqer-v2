import { z } from "zod";
import {
  fxRateString,
  moneyAmountString,
  optionalFxRateString,
  optionalMoneyAmountString,
  positiveMoneyAmountString,
  qtyString,
  ratePctString,
  discountPctString,
  unitPriceString,
} from "./money";
import { treasurySettlementFieldsSchema } from "./treasury-settlement";
import { invoiceLetterSchema } from "./contact";
import { idempotencyKeySchema } from "./idempotency";

const supplierInvoiceLineSchema = z.object({
  description: z.string().min(1, "Descripción requerida"),
  quantity:    qtyString,
  unitPrice:   unitPriceString,
  taxRate:     ratePctString.optional().default("0.0000"),
  discountPct: discountPctString.optional().default("0.0000"),
  sortOrder:   z.number().int().min(0).optional().default(0),
  /** Required when invoice has projectId ([D-055]). */
  wbsNodeId:   z.string().uuid().optional().nullable(),
  /** Optional link to PO line when invoice is tied to an OC ([D-066]). */
  purchaseOrderLineId: z.string().uuid().optional().nullable(),
  /** Optional APU hint ([D-110] / D-068); does not change EDT imputation. */
  costAnalysisLineId: z.string().uuid().optional().nullable(),
  /** Job-cost nature ([D-099]). Required for project invoices without PO line inherit; default MATERIAL. */
  costType: z
    .enum(["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT", "OTHER"])
    .optional()
    .nullable(),
});

/** projectId null/omit = company-level AP (Phase 16B). Project routes must still pass projectId from URL. */
export const createSupplierInvoiceSchema = z.object({
  projectId:         z.string().uuid().optional().nullable(),
  supplierContactId: z.string().uuid(),
  issueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency:          z.string().length(3).default("ARS"),
  fxRate:            optionalFxRateString,
  /** Letra A/B/C/E del comprobante recibido ([D-084]). */
  invoiceLetter:     invoiceLetterSchema.optional().nullable(),
  /** When true, line unit prices are gross (IVA incluido) — [D-086]. */
  pricesIncludeTax:  z.boolean().optional(),
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
  invoiceLetter:     invoiceLetterSchema.optional().nullable(),
  pricesIncludeTax:  z.boolean().optional(),
  notes:             z.string().optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
  purchaseOrderId:   z.string().uuid().optional().nullable(),
  lines:             z.array(supplierInvoiceLineSchema).min(1).optional(),
});

export const createPaymentFieldsSchema = z
  .object({
    payableId:      z.string().uuid(),
    accountId:      z.string().uuid(),
    paymentDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount:         optionalMoneyAmountString,
    /** Server applies stored balanceDue — [D-053]. */
    payFullBalance: z.boolean().optional(),
    notes:          z.string().optional().nullable(),
    idempotencyKey: idempotencyKeySchema,
  })
  .merge(treasurySettlementFieldsSchema);

export const createPaymentSchema = createPaymentFieldsSchema.superRefine((val, ctx) => {
  if (!val.payFullBalance && val.amount == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Monto inválido",
      path: ["amount"],
    });
  }
  if (val.amount != null && (val.amount.startsWith("-") || /^-?0+(\.0+)?$/.test(val.amount))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El monto debe ser mayor a 0",
      path: ["amount"],
    });
  }
});

export const payNowSchema = z
  .object({
    accountId:      z.string().uuid(),
    paymentDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount:         optionalMoneyAmountString,
    /** When true or amount omitted, server pays stored invoice total ([D-053]). */
    payFullBalance: z.boolean().optional(),
    notes:          z.string().optional().nullable(),
    idempotencyKey: idempotencyKeySchema,
  })
  .merge(treasurySettlementFieldsSchema)
  .superRefine((val, ctx) => {
    if (!val.payFullBalance && val.amount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monto inválido",
        path: ["amount"],
      });
    }
    if (val.amount != null && (val.amount.startsWith("-") || /^-?0+(\.0+)?$/.test(val.amount))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El monto debe ser mayor a 0",
        path: ["amount"],
      });
    }
  });

/** Corporate or project AP composite flow ([D-052]). ISSUED + Payable — not DRAFT create. */
export const registerApExpenseSchema = createSupplierInvoiceSchema.extend({
  idempotencyKey: idempotencyKeySchema,
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
export {
  moneyAmountString,
  positiveMoneyAmountString,
  fxRateString,
  qtyString,
  ratePctString,
  unitPriceString,
};
