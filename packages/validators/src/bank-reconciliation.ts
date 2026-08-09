import { z } from "zod";
import { moneyAmountString, positiveMoneyAmountString } from "./money";

export const bankStatementLineDirectionEnum = z.enum(["CREDIT", "DEBIT"]);

export const createBankReconciliationSchema = z
  .object({
    accountId: z.string().uuid(),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    openingBalance: moneyAmountString,
    closingBalance: moneyAmountString,
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.periodEnd < val.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha hasta no puede ser anterior a la fecha desde",
        path: ["periodEnd"],
      });
    }
  });

export const addBankStatementLineSchema = z.object({
  reconciliationId: z.string().uuid(),
  lineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(500),
  amount: positiveMoneyAmountString,
  direction: bankStatementLineDirectionEnum,
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const matchBankReconciliationSchema = z.object({
  reconciliationId: z.string().uuid(),
  statementLineId: z.string().uuid(),
  accountMovementId: z.string().uuid(),
});

/** Raw CSV text for bank statement import ([D-076]). */
export const importBankStatementCsvSchema = z.object({
  reconciliationId: z.string().uuid(),
  csvText: z.string().min(1).max(1_000_000),
});

/** Raw OFX/QFX text for bank statement import ([D-079]). */
export const importBankStatementOfxSchema = z.object({
  reconciliationId: z.string().uuid(),
  ofxText: z.string().min(1).max(2_000_000),
});

/** Create system movement from unmatched statement line and match ([BANK_RECONCILIATION.md] §8). */
export const createMovementFromStatementLineSchema = z.object({
  reconciliationId: z.string().uuid(),
  statementLineId: z.string().uuid(),
});

/** Reopen CLOSED session with audited reason ([D-080]). */
export const reopenBankReconciliationSchema = z.object({
  reconciliationId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, "Indicá un motivo de reapertura (mín. 3 caracteres)")
    .max(1024),
});

/** Cancel session; reason required when cancelling a CLOSED session. */
export const cancelBankReconciliationSchema = z.object({
  reconciliationId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .max(1024)
    .optional()
    .nullable(),
});

export type CreateBankReconciliationInput = z.infer<typeof createBankReconciliationSchema>;
export type AddBankStatementLineInput = z.infer<typeof addBankStatementLineSchema>;
export type MatchBankReconciliationInput = z.infer<typeof matchBankReconciliationSchema>;
export type ImportBankStatementCsvInput = z.infer<typeof importBankStatementCsvSchema>;
export type ImportBankStatementOfxInput = z.infer<typeof importBankStatementOfxSchema>;
export type CreateMovementFromStatementLineInput = z.infer<
  typeof createMovementFromStatementLineSchema
>;
export type ReopenBankReconciliationInput = z.infer<typeof reopenBankReconciliationSchema>;
export type CancelBankReconciliationInput = z.infer<typeof cancelBankReconciliationSchema>;
