import { z } from "zod";
import {
  moneyAmountString,
  optionalMoneyAmountString,
  qtyString,
  ratePctString,
} from "./money";

const invoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity:    qtyString,
  unitPrice:   moneyAmountString,
  taxRate:     ratePctString.optional().default("0.0000"),
  sortOrder:   z.number().int().min(0).optional().default(0),
  certificationLineId: z.string().uuid().optional().nullable(),
});

/** projectId null/omit = company-level AR (D-051). Project routes must still pass projectId from URL. */
export const createSalesInvoiceSchema = z.object({
  projectId:           z.string().uuid().optional().nullable(),
  clientContactId:     z.string().uuid(),
  certificationId:     z.string().uuid().optional().nullable(),
  issueDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency:            z.string().length(3).default("ARS"),
  notes:               z.string().optional().nullable(),
  internalNotes:       z.string().optional().nullable(),
  externalInvoiceRef:  z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  lines:               z.array(invoiceLineSchema).min(1, "Debe tener al menos una línea"),
});

export const createInvoiceFromCertificationSchema = z.object({
  certificationId: z.string().uuid(),
  issueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxRate:         ratePctString.optional().default("21.0000"),
  notes:           z.string().optional().nullable(),
  internalNotes:   z.string().optional().nullable(),
});

export const updateSalesInvoiceSchema = z.object({
  issueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:         z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});



export const collectNowSchema = z.object({
  accountId:            z.string().uuid(),
  collectionDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:               optionalMoneyAmountString,
  /** When true or amount omitted, server collects stored total ([D-053]). */
  collectFullBalance:   z.boolean().optional(),
  notes:                z.string().optional().nullable(),
});

export const registerArSaleSchema = createSalesInvoiceSchema.extend({
  collectNow: collectNowSchema.optional(),
});

/** Corporate AR composite flow (D-051) — mirrors registerApExpenseSchema. */
export const registerArIncomeSchema = createSalesInvoiceSchema
  .omit({ projectId: true, certificationId: true })
  .extend({
    collectNow: collectNowSchema.optional(),
  });

export type CreateSalesInvoiceInput          = z.infer<typeof createSalesInvoiceSchema>;
export type CreateInvoiceFromCertificationInput = z.infer<typeof createInvoiceFromCertificationSchema>;
export type UpdateSalesInvoiceInput          = z.infer<typeof updateSalesInvoiceSchema>;
export type RegisterArSaleInput                = z.infer<typeof registerArSaleSchema>;
export type RegisterArIncomeInput              = z.infer<typeof registerArIncomeSchema>;
