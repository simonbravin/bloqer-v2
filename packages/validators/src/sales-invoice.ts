import { z } from "zod";

const invoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity:    z.string().regex(/^\d+(\.\d+)?$/, "Cantidad inválida"),
  unitPrice:   z.string().regex(/^\d+(\.\d+)?$/, "Precio inválido"),
  taxRate:     z.string().regex(/^\d+(\.\d+)?$/).optional().default("0"),
  sortOrder:   z.number().int().min(0).optional().default(0),
  certificationLineId: z.string().uuid().optional().nullable(),
});

export const createSalesInvoiceSchema = z.object({
  projectId:       z.string().uuid(),
  clientContactId: z.string().uuid(),
  certificationId: z.string().uuid().optional().nullable(),
  issueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency:        z.string().length(3).default("ARS"),
  notes:           z.string().optional().nullable(),
  internalNotes:   z.string().optional().nullable(),
  lines:           z.array(invoiceLineSchema).min(1, "Debe tener al menos una línea"),
});

export const createInvoiceFromCertificationSchema = z.object({
  certificationId: z.string().uuid(),
  issueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxRate:         z.string().regex(/^\d+(\.\d+)?$/).optional().default("21"),
  notes:           z.string().optional().nullable(),
  internalNotes:   z.string().optional().nullable(),
});

export const updateSalesInvoiceSchema = z.object({
  issueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:         z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

export type CreateSalesInvoiceInput          = z.infer<typeof createSalesInvoiceSchema>;
export type CreateInvoiceFromCertificationInput = z.infer<typeof createInvoiceFromCertificationSchema>;
export type UpdateSalesInvoiceInput          = z.infer<typeof updateSalesInvoiceSchema>;
