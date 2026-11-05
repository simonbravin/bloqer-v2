import { z } from "zod";
import { moneyAmountString, optionalFxRateString } from "./money";
import { collectNowSchema } from "./sales-invoice";
import { idempotencyKeySchema } from "./idempotency";

export const registerArAdvanceSchema = z.object({
  projectId: z.string().uuid(),
  clientContactId: z.string().uuid(),
  issueDate: z.string().date("Fecha inválida"),
  dueDate: z.string().date("Fecha inválida").optional(),
  fxRate: optionalFxRateString,
  currency: z.string().length(3).default("ARS"),
  amount: moneyAmountString,
  notes: z.string().optional().nullable(),
  /** Register-level key for the ISSUED invoice + Receivable composite. Nested collectNow has its own key. */
  idempotencyKey: idempotencyKeySchema,
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
  amount: moneyAmountString,
  notes: z.string().optional().nullable(),
});

export type RegisterSupplierAdvanceInput = z.infer<typeof registerSupplierAdvanceSchema>;
