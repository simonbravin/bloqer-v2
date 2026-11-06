import { z } from "zod";
import { DEFAULT_IIBB_PERCEPTION_RATE_PCT } from "@bloqer/domain";
import {
  fxRateString,
  moneyAmountString,
  optionalFxRateString,
  optionalMoneyAmountString,
  positiveMoneyAmountString,
  qtyString,
  ratePctString,
  nonNegativeRatePctString,
  discountPctString,
  unitPriceString,
} from "./money";
import { treasurySettlementFieldsSchema } from "./treasury-settlement";
import { invoiceLetterSchema } from "./contact";
import { idempotencyKeySchema } from "./idempotency";

const supplierInvoiceLineSchema = z.object({
  id: z.string().guid().optional(),
  description: z.string().min(1, "Descripción requerida"),
  quantity:    qtyString,
  unitPrice:   unitPriceString,
  taxRate:     nonNegativeRatePctString.optional().default("0.0000"),
  discountPct: discountPctString.optional().default("0.0000"),
  sortOrder:   z.number().int().min(0).optional().default(0),
  /** Required when invoice has projectId ([D-055]). */
  wbsNodeId:   z.string().guid().optional().nullable(),
  /** Optional link to PO line when invoice is tied to an OC ([D-066]). */
  purchaseOrderLineId: z.string().guid().optional().nullable(),
  /** Optional APU hint ([D-110] / D-068); does not change EDT imputation. */
  costAnalysisLineId: z.string().guid().optional().nullable(),
  /** Job-cost nature ([D-099]). Required for project invoices without PO line inherit; default MATERIAL. */
  costType: z
    .enum(["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT", "OTHER"])
    .optional()
    .nullable(),
});

const calendarDate = z.string().date("Ingresá una fecha válida");

/** projectId null/omit = company-level AP (Phase 16B). Project routes must still pass projectId from URL. */
export const createSupplierInvoiceSchema = z.object({
  projectId:         z.string().guid().optional().nullable(),
  supplierContactId: z.string().guid(),
  issueDate:         calendarDate,
  dueDate:           calendarDate,
  currency:          z.string().length(3).default("ARS"),
  fxRate:            optionalFxRateString,
  /** Letra A/B/C/E del comprobante recibido ([D-084]). */
  invoiceLetter:     invoiceLetterSchema.optional().nullable(),
  /** When true, line unit prices are gross (IVA incluido) — [D-086]. */
  pricesIncludeTax:  z.boolean().optional(),
  /** Percepción IIBB % on net subtotal ([D-112]). Default 3%. */
  iibbPerceptionRate: nonNegativeRatePctString.optional().prefault(DEFAULT_IIBB_PERCEPTION_RATE_PCT),
  notes:             z.string().optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
  purchaseOrderId:   z.string().guid().optional().nullable(),
  lines:             z.array(supplierInvoiceLineSchema).min(1, "Debe tener al menos una línea"),
});

export const updateSupplierInvoiceSchema = z.object({
  supplierContactId: z.string().guid().optional(),
  issueDate:         calendarDate.optional(),
  dueDate:           calendarDate.optional(),
  fxRate:            optionalFxRateString,
  invoiceLetter:     invoiceLetterSchema.optional().nullable(),
  pricesIncludeTax:  z.boolean().optional(),
  iibbPerceptionRate: nonNegativeRatePctString.optional(),
  notes:             z.string().optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
  purchaseOrderId:   z.string().guid().optional().nullable(),
  lines:             z.array(supplierInvoiceLineSchema).min(1).optional(),
});

export const createPaymentFieldsSchema = z
  .object({
    payableId:      z.string().guid(),
    accountId:      z.string().guid(),
    paymentDate:    calendarDate,
    fxRate:         optionalFxRateString,
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
    accountId:      z.string().guid(),
    paymentDate:    calendarDate,
    fxRate:         optionalFxRateString,
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

/** Same canonical line/date validation for notes created directly by a service consumer. */
export const createSupplierFiscalNoteSchema = z.object({
  parentSupplierInvoiceId: z.string().guid(),
  issueDate: calendarDate.optional(),
  dueDate: calendarDate.optional(),
  notes: z.string().optional().nullable(),
  lines: z.array(supplierInvoiceLineSchema).min(1).optional(),
});

export const createSupplierInvoiceFromPurchaseOrderSchema = z.object({
  projectId:          z.string().guid(),
  purchaseOrderId:    z.string().guid(),
  purchaseReceiptId:  z.string().guid().optional().nullable(),
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
