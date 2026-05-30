import { z } from "zod";
import { collectNowSchema } from "./sales-invoice";

export const registerArAdvanceSchema = z.object({
  projectId: z.string().uuid(),
  clientContactId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().length(3).default("ARS"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Monto inválido"),
  notes: z.string().optional().nullable(),
  collectNow: collectNowSchema,
});

export type RegisterArAdvanceInput = z.infer<typeof registerArAdvanceSchema>;

/** Phase 2 — pago anticipado a proveedor sin factura (cuenta puente). Validación de entrada; implementación pendiente de schema. */
export const registerSupplierAdvanceSchema = z.object({
  projectId: z.string().uuid(),
  supplierContactId: z.string().uuid(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.string().uuid(),
  currency: z.string().length(3).default("ARS"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Monto inválido"),
  notes: z.string().optional().nullable(),
});

export type RegisterSupplierAdvanceInput = z.infer<typeof registerSupplierAdvanceSchema>;
