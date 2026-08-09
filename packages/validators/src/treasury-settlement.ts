import { z } from "zod";

/** Settlement channel for Collection / Payment ([D-074] / Q-054). */
export const treasurySettlementMethodEnum = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "CHECK",
  "CARD",
  "OTHER",
]);

export type TreasurySettlementMethod = z.infer<typeof treasurySettlementMethodEnum>;

export const treasurySettlementFieldsSchema = z.object({
  paymentMethod: treasurySettlementMethodEnum.optional().nullable(),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});
