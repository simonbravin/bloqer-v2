import { z } from "zod";

export const projectTypeSchema = z.enum(["PUBLIC", "PRIVATE"]);
export const projectStatusSchema = z.enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);

/** Empty form fields explicitly clear nullable dates; omitted fields stay unchanged. */
const optionalDateField = z
  .union([
    z.string().date("Ingresá una fecha válida").transform((value) => new Date(value)),
    z.date({ error: "Ingresá una fecha válida" }),
    z.literal(""),
    z.null(),
  ], { error: "Ingresá una fecha válida" })
  .transform((value) => value === "" ? null : value)
  .optional();

function validateProjectDateRange(
  input: { startDate?: Date | null; expectedEndDate?: Date | null },
  ctx: z.RefinementCtx,
) {
  if (input.startDate && input.expectedEndDate && input.startDate > input.expectedEndDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expectedEndDate"],
      message: "La fecha estimada de fin no puede ser anterior a la fecha de inicio",
    });
  }
}

export const createProjectSchema = z.object({
  code: z.string().min(1, "El código es obligatorio").max(50),
  name: z.string().min(1, "El nombre es obligatorio").max(255),
  description: z.string().max(2000).optional(),
  clientContactId: z.string({ error: "Seleccioná un cliente válido" }).guid("Seleccioná un cliente válido"),
  type: projectTypeSchema,
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  startDate: optionalDateField,
  expectedEndDate: optionalDateField,
  notes: z.string().max(2000).optional(),
}).superRefine(validateProjectDateRange);

export const updateProjectSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  clientContactId: z.string().guid().optional(),
  type: projectTypeSchema.optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  startDate: optionalDateField,
  expectedEndDate: optionalDateField,
  notes: z.string().max(2000).optional(),
}).superRefine(validateProjectDateRange);

export const listProjectsSchema = z.object({
  status: projectStatusSchema.optional(),
  search: z.string().max(200).optional(),
  clientContactId: z.string().guid().optional(),
  page: z.number().int().safe().min(1).optional(),
  pageSize: z.number().int().safe().min(1).max(100).optional(),
}).superRefine((input, ctx) => {
  if (!Number.isSafeInteger(((input.page ?? 1) - 1) * (input.pageSize ?? 20))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["page"],
      message: "La página solicitada no es válida",
    });
  }
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ProjectFormInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsInput = z.infer<typeof listProjectsSchema>;

export const projectLifecycleInputSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
  comment: z.string().trim().max(2000).optional(),
});

export const projectReactivateInputSchema = projectLifecycleInputSchema.extend({
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(2000),
});

export const projectCancelActiveInputSchema = projectLifecycleInputSchema.extend({
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(2000),
});

export type ProjectLifecycleInput = z.infer<typeof projectLifecycleInputSchema>;
export type ProjectReactivateInput = z.infer<typeof projectReactivateInputSchema>;
export type ProjectCancelActiveInput = z.infer<typeof projectCancelActiveInputSchema>;

/** Roster label only — does not grant permissions ([D-091]). */
export const projectTeamMemberKindSchema = z.enum([
  "PROJECT_MANAGER",
  "SITE_FOREMAN",
  "OTHER",
]);

export const addProjectTeamMemberSchema = z.object({
  userId: z.string().guid("Seleccioná un usuario válido"),
  kind: projectTeamMemberKindSchema.default("OTHER"),
});

export const projectTeamMemberIdSchema = z.string().guid("Miembro del equipo no encontrado");

export type AddProjectTeamMemberInput = z.infer<typeof addProjectTeamMemberSchema>;
export type ProjectTeamMemberKindInput = z.infer<typeof projectTeamMemberKindSchema>;
