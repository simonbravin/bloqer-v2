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
  budgetId: z.string().guid().optional(),
  status: scheduleItemStatusSchema.optional(),
  delayedOnly: z.preprocess(
    (value) =>
      value === "1" || value === "true" ? true : value === "0" || value === "false" ? false : value,
    z.boolean().optional(),
  ),
  /** D-103 — filter by TASK | MILESTONE */
  itemType: scheduleItemTypeSchema.optional(),
});

export const importScheduleFromBudgetSchema = z.object({
  budgetId: z.string().guid(),
  includeGroups: z.boolean().optional().default(true),
  placeholderDates: z.boolean().optional().default(false),
});

export const createScheduleItemSchema = z.object({
  parentId: z.string().guid().nullable().optional(),
  afterItemId: z.string().guid().nullable().optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(500),
  type: scheduleItemTypeSchema.optional().default("TASK"),
  startDate: z.string().date("Ingresá una fecha válida").nullable().optional(),
  endDate: z.string().date("Ingresá una fecha válida").nullable().optional(),
  sortOrder: z.number().int().min(0).max(2_147_483_647).optional(),
  /** Optional leaf WBS (EDT) to link as primary after create. */
  wbsNodeId: z.string().guid().optional(),
});

export const moveScheduleItemSchema = z.object({
  itemId: z.string().guid(),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("up") }),
    z.object({ kind: z.literal("down") }),
    z.object({ kind: z.literal("indent") }),
    z.object({ kind: z.literal("outdent") }),
    z.object({
      kind: z.literal("place"),
      parentId: z.string().guid().nullable(),
      afterItemId: z.string().guid().nullable(),
    }),
  ]),
});

export const updateScheduleItemDatesSchema = z.object({
  startDate: z.string().date("Ingresá una fecha válida").nullable(),
  endDate: z.string().date("Ingresá una fecha válida").nullable(),
});

/** Progress % — half-up to 2 dp (ScheduleItem.progressPct Decimal(5,2) / D-053). */
export const updateScheduleItemProgressSchema = z.object({
  progressPct: z
    .union([
      z.number().finite().min(0).max(100),
      z
        .string()
        .trim()
        .regex(/^\d+(?:\.\d+)?$/, "Avance inválido (0–100)")
        .refine((value) => Number(value) <= 100, "Avance inválido (0–100)"),
    ])
    .transform((v) => roundToDecimals(v, 2))
    .refine((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 100;
    }, "Avance inválido (0–100)")
    .transform((v) => Number(v)),
});

export const blockScheduleItemSchema = z.object({
  blockReason: z.string().trim().min(1, "La causa es obligatoria").max(2000),
});

export const linkWbsNodesSchema = z
  .object({
    wbsNodeIds: z.array(z.string().guid()).min(1),
    primaryWbsNodeId: z.string().guid().optional(),
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
  wbsNodeId: z.string().guid(),
});

export const addScheduleDependencySchema = z.object({
  predecessorId: z.string().guid(),
  successorId: z.string().guid(),
});

export const scheduleItemIdSchema = z.object({
  scheduleItemId: z.string().guid(),
});

export const updateScheduleItemNameSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(500),
});

export const removeScheduleDependencySchema = z.object({
  dependencyId: z.string().guid(),
});
