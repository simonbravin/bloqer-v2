import { z } from "zod";
import { accountingMappingEventTypeSchema } from "./accounting";

export const createAccountingMappingRuleSchema = z.object({
  companyId:        z.string().uuid().optional().nullable(),
  eventType:        accountingMappingEventTypeSchema,
  name:             z.string().min(1).max(256),
  description:      z.string().max(1024).optional().nullable(),
  debitAccountId:   z.string().uuid(),
  creditAccountId:  z.string().uuid(),
  priority:         z.coerce.number().int().min(0).max(1_000_000).optional().default(100),
  metadata:         z.record(z.string(), z.unknown()).optional().nullable(),
});

export const updateAccountingMappingRuleSchema = z.object({
  /** When set, must match the rule’s company (tenant-wide users: pass rule `companyId` / `?empresa=` scope). Not applied as a field change on the rule. */
  companyId:        z.string().uuid().optional().nullable(),
  eventType:        accountingMappingEventTypeSchema.optional(),
  name:             z.string().min(1).max(256).optional(),
  description:      z.string().max(1024).optional().nullable(),
  debitAccountId:   z.string().uuid().optional(),
  creditAccountId:  z.string().uuid().optional(),
  priority:         z.coerce.number().int().min(0).max(1_000_000).optional(),
  isActive:         z.boolean().optional(),
  metadata:         z.record(z.string(), z.unknown()).optional().nullable(),
});

/** Optional admin-style generator: company scope from context or optional `companyId` (validated). */
export const generateJournalSuggestionSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  eventType: accountingMappingEventTypeSchema,
  sourceId:  z.string().uuid(),
});

export type CreateAccountingMappingRuleInput = z.infer<typeof createAccountingMappingRuleSchema>;
export type UpdateAccountingMappingRuleInput = z.infer<typeof updateAccountingMappingRuleSchema>;
export type GenerateJournalSuggestionInput = z.infer<typeof generateJournalSuggestionSchema>;
