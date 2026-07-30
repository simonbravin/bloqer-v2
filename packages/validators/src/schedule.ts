import { z } from "zod";
import { roundToDecimals } from "@bloqer/utils";

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
  placeholderDates: z.boolean().optional().default(false),
});

export const createScheduleItemSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(500),
  type: scheduleItemTypeSchema.optional().default("TASK"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  /** Optional leaf WBS (EDT) to link as primary after create. */
  wbsNodeId: z.string().uuid().optional(),
});

export const updateScheduleItemDatesSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/** Progress % — half-up to 2 dp (ScheduleItem.progressPct Decimal(5,2) / D-053). */
export const updateScheduleItemProgressSchema = z.object({
  progressPct: z
    .union([z.number(), z.string()])
    .transform((v) => roundToDecimals(v, 2))
    .refine((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 100;
    }, "Avance inválido (0–100)")
    .transform((v) => Number(v)),
});

export const blockScheduleItemSchema = z.object({
  blockReason: z.string().min(1, "La causa es obligatoria").max(2000),
});

export const linkWbsNodesSchema = z
  .object({
    wbsNodeIds: z.array(z.string().uuid()).min(1),
    primaryWbsNodeId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const unique = new Set(data.wbsNodeIds);
    if (unique.size !== data.wbsNodeIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hay partidas EDT duplicadas",
        path: ["wbsNodeIds"],
      });
    }
    if (data.primaryWbsNodeId && !unique.has(data.primaryWbsNodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La partida primaria debe estar en la lista vinculada",
        path: ["primaryWbsNodeId"],
      });
    }
  });

export const unlinkWbsNodeSchema = z.object({
  wbsNodeId: z.string().uuid(),
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
