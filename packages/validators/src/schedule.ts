import { z } from "zod";

export const scheduleItemStatusSchema = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);

export const scheduleItemTypeSchema = z.enum(["TASK", "MILESTONE"]);

export const scheduleWorkspaceFiltersSchema = z.object({
  budgetId: z.string().uuid().optional(),
  status: scheduleItemStatusSchema.optional(),
  delayedOnly: z.coerce.boolean().optional(),
});

export const importScheduleFromBudgetSchema = z.object({
  budgetId: z.string().uuid(),
  includeGroups: z.boolean().optional().default(true),
  placeholderDates: z.boolean().optional().default(true),
});

export const createScheduleItemSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(500),
  type: scheduleItemTypeSchema.optional().default("TASK"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateScheduleItemDatesSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const updateScheduleItemProgressSchema = z.object({
  progressPct: z.number().min(0).max(100),
});

export const blockScheduleItemSchema = z.object({
  blockReason: z.string().min(1, "La causa es obligatoria").max(2000),
});

export const linkWbsNodesSchema = z.object({
  wbsNodeIds: z.array(z.string().uuid()).min(1),
  primaryWbsNodeId: z.string().uuid().optional(),
});

export const addScheduleDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  successorId: z.string().uuid(),
});

export const scheduleItemIdSchema = z.object({
  scheduleItemId: z.string().uuid(),
});

export const updateScheduleItemNameSchema = z.object({
  name: z.string().min(1).max(500),
});

export const removeScheduleDependencySchema = z.object({
  dependencyId: z.string().uuid(),
});
