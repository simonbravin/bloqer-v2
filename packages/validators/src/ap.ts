import { z } from "zod";

const supplierInvoiceLineSchema = z.object({
  description: z.string().min(1, "Descripción requerida"),
  quantity:    z.string().regex(/^\d+(\.\d+)?$/, "Cantidad inválida"),
  unitPrice:   z.string().regex(/^\d+(\.\d+)?$/, "Precio inválido"),
  taxRate:     z.string().regex(/^\d+(\.\d+)?$/).optional().default("0"),
  sortOrder:   z.number().int().min(0).optional().default(0),
});

/** projectId null/omit = company-level AP (Phase 16B). Project routes must still pass projectId from URL. */
export const createSupplierInvoiceSchema = z.object({
  projectId:         z.string().uuid().optional().nullable(),
  supplierContactId: z.string().uuid(),
  issueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency:          z.string().length(3).default("ARS"),
  notes:             z.string().optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
  purchaseOrderId:   z.string().uuid().optional().nullable(),
  lines:             z.array(supplierInvoiceLineSchema).min(1, "Debe tener al menos una línea"),
});

export const updateSupplierInvoiceSchema = z.object({
  supplierContactId: z.string().uuid().optional(),
  issueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:             z.string().optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
  purchaseOrderId:   z.string().uuid().optional().nullable(),
  lines:             z.array(supplierInvoiceLineSchema).min(1).optional(),
});

export const createPaymentSchema = z.object({
  payableId:   z.string().uuid(),
  accountId:   z.string().uuid(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:      z.string().regex(/^\d+(\.\d+)?$/, "Monto inválido"),
  notes:       z.string().optional().nullable(),
});

export type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
export type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>;
export type CreatePaymentInput         = z.infer<typeof createPaymentSchema>;
