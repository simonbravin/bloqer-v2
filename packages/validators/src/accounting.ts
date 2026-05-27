import { z } from "zod";

const amountStr = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Monto inválido")
  .default("0");

export const accountTypeSchema = z.enum([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
]);

export const journalEntryStatusSchema = z.enum(["DRAFT", "POSTED", "CANCELLED"]);

export const journalEntrySourceTypeSchema = z.enum([
  "MANUAL",
  "SALES_INVOICE",
  "COLLECTION",
  "SUPPLIER_INVOICE",
  "PAYMENT",
  "INTERNAL_TRANSFER",
  "STOCK_MOVEMENT",
  "ADJUSTMENT",
  "TREASURY_INFLOW",
  "TREASURY_OUTFLOW",
]);

export const accountingMappingEventTypeSchema = z.enum([
  "COLLECTION_CONFIRMED",
  "PAYMENT_CONFIRMED",
  "TREASURY_INFLOW",
  "TREASURY_OUTFLOW",
  "TREASURY_TRANSFER",
  "STOCK_CONSUMPTION",
  "MANUAL_CAPITAL_CONTRIBUTION",
  "MANUAL_OWNER_LOAN",
]);

export const journalLineInputSchema = z.object({
  accountId:   z.string().uuid(),
  projectId:   z.string().uuid().optional().nullable(),
  description: z.string().max(512).optional().nullable(),
  debit:       amountStr,
  credit:      amountStr,
  currency:    z.string().min(1).max(8).default("ARS"),
});

export const createAccountingAccountSchema = z.object({
  companyId:   z.string().uuid().optional().nullable(),
  code:        z.string().min(1).max(64),
  name:        z.string().min(1).max(256),
  type:        accountTypeSchema,
  parentId:    z.string().uuid().optional().nullable(),
  description: z.string().max(1024).optional().nullable(),
});

export const updateAccountingAccountSchema = z.object({
  name:        z.string().min(1).max(256).optional(),
  type:        accountTypeSchema.optional(),
  parentId:    z.string().uuid().optional().nullable(),
  description: z.string().max(1024).optional().nullable(),
  isActive:    z.boolean().optional(),
});

export const createJournalEntrySchema = z.object({
  companyId:   z.string().uuid().optional().nullable(),
  projectId:     z.string().uuid().optional().nullable(),
  entryDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description:   z.string().min(1).max(1024),
  reference:     z.string().max(256).optional().nullable(),
  lines:         z.array(journalLineInputSchema).min(2),
  sourceType:    journalEntrySourceTypeSchema.optional(),
  sourceId:      z.string().max(128).optional().nullable(),
});

export const updateJournalEntrySchema = z.object({
  companyId:   z.string().uuid().optional().nullable(),
  projectId:   z.string().uuid().optional().nullable(),
  entryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().min(1).max(1024).optional(),
  reference:   z.string().max(256).optional().nullable(),
  lines:       z.array(journalLineInputSchema).min(2).optional(),
});

export const listJournalEntriesSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  status:    journalEntryStatusSchema.optional(),
  fromDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:      z.coerce.number().int().min(1).optional().default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const listAccountLedgerSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid(),
  limit:     z.coerce.number().int().min(1).max(500).optional().default(200),
});

export const postJournalEntrySchema = z.object({
  id: z.string().uuid(),
});

export const cancelJournalEntrySchema = z.object({
  id: z.string().uuid(),
});

export type CreateAccountingAccountInput = z.infer<typeof createAccountingAccountSchema>;
export type UpdateAccountingAccountInput = z.infer<typeof updateAccountingAccountSchema>;
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;
export type ListJournalEntriesInput = z.infer<typeof listJournalEntriesSchema>;
export type ListAccountLedgerInput = z.infer<typeof listAccountLedgerSchema>;
export type JournalLineInput = z.infer<typeof journalLineInputSchema>;
export type JournalEntrySourceTypeInput = z.infer<typeof journalEntrySourceTypeSchema>;
export type AccountingMappingEventTypeInput = z.infer<typeof accountingMappingEventTypeSchema>;
