import { z } from "zod";
import { accountingMappingEventTypeSchema } from "./accounting";

export const createAccountingMappingRuleSchema = z.object({
  companyId:        z.string().guid().optional().nullable(),
  eventType:        accountingMappingEventTypeSchema,
  name:             z.string().trim().min(1).max(256),
  description:      z.string().max(1024).optional().nullable(),
  debitAccountId:   z.string().guid(),
  creditAccountId:  z.string().guid(),
  priority:         z.coerce.number().int().min(0).max(1_000_000).optional().default(100),
  metadata:         z.record(z.string(), z.unknown()).optional().nullable(),
});

export const updateAccountingMappingRuleSchema = z.object({
  /** When set, must match the rule’s company (tenant-wide users: pass rule `companyId` / `?empresa=` scope). Not applied as a field change on the rule. */
  companyId:        z.string().guid().optional().nullable(),
  eventType:        accountingMappingEventTypeSchema.optional(),
  name:             z.string().trim().min(1).max(256).optional(),
  description:      z.string().max(1024).optional().nullable(),
  debitAccountId:   z.string().guid().optional(),
  creditAccountId:  z.string().guid().optional(),
  priority:         z.coerce.number().int().min(0).max(1_000_000).optional(),
  isActive:         z.boolean().optional(),
  metadata:         z.record(z.string(), z.unknown()).optional().nullable(),
});

/** Optional admin-style generator: company scope from context or optional `companyId` (validated). */
export const generateJournalSuggestionSchema = z.object({
  companyId: z.string().guid().optional().nullable(),
  eventType: accountingMappingEventTypeSchema,
  sourceId:  z.string().guid(),
});

export type CreateAccountingMappingRuleInput = z.infer<typeof createAccountingMappingRuleSchema>;
export type UpdateAccountingMappingRuleInput = z.infer<typeof updateAccountingMappingRuleSchema>;
export type GenerateJournalSuggestionInput = z.infer<typeof generateJournalSuggestionSchema>;
