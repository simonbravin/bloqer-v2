import { createPaymentSchema, registerApExpenseSchema } from "./ap";
import { registerArIncomeSchema } from "./sales-invoice";
import { z } from "zod";

export const createTreasuryAccountSchema = z.object({
  name:           z.string().min(1),
  type:           z.enum(["BANK", "CASH", "DIGITAL_WALLET", "OTHER"]),
  currency:       z.string().length(3).default("ARS"),
  bankName:       z.string().optional().nullable(),
  accountNumber:  z.string().optional().nullable(),
  alias:          z.string().optional().nullable(),
  notes:          z.string().optional().nullable(),
  openingBalance: z.string().regex(/^\d+(\.\d+)?$/).optional().default("0"),
  companyId:      z.string().uuid().optional().nullable(),
});

export const updateTreasuryAccountSchema = z.object({
  name:          z.string().min(1).optional(),
  bankName:      z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  alias:         z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
});

export const createCollectionSchema = z.object({
  receivableId:   z.string().uuid(),
  accountId:      z.string().uuid(),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:         z.string().regex(/^\d+(\.\d+)?$/, "Monto inválido"),
  notes:          z.string().optional().nullable(),
});

export const createInternalTransferSchema = z.object({
  sourceAccountId:      z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  transferDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:               z.string().regex(/^\d+(\.\d+)?$/, "Monto inválido"),
  description:          z.string().optional().nullable(),
});



export const createCorporateTreasuryInflowSchema = z.object({
  accountId:              z.string().uuid(),
  movementDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:                 z.string().regex(/^\d+(\.\d+)?$/, "Monto invalido"),
  description:            z.string().trim().min(1, "Descripcion requerida"),
  /** Optional directory contact with CLIENT role for corporate inflows — D-049. */
  counterpartyContactId:  z.string().uuid().optional().nullable(),
  /** Official voucher issued outside Bloqer (e.g. ARCA FC A 0001-00001234). */
  externalInvoiceRef:     z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const registerTransactionSchema = z.discriminatedUnion("kind", [
  registerApExpenseSchema.extend({ kind: z.literal("AP_EXPENSE") }),
  createCorporateTreasuryInflowSchema.extend({ kind: z.literal("TREASURY_INFLOW") }),
  createPaymentSchema.extend({ kind: z.literal("PAYMENT") }),
  registerArIncomeSchema.extend({ kind: z.literal("AR_INCOME") }),
]);

export type CreateTreasuryAccountInput   = z.infer<typeof createTreasuryAccountSchema>;
export type UpdateTreasuryAccountInput   = z.infer<typeof updateTreasuryAccountSchema>;
export type CreateCollectionInput        = z.infer<typeof createCollectionSchema>;
export type CreateInternalTransferInput  = z.infer<typeof createInternalTransferSchema>;
export type CreateCorporateTreasuryInflowInput = z.infer<typeof createCorporateTreasuryInflowSchema>;
export type RegisterTransactionInput        = z.infer<typeof registerTransactionSchema>;
