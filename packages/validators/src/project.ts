import { z } from "zod";

export const projectTypeSchema = z.enum(["PUBLIC", "PRIVATE"]);
export const projectStatusSchema = z.enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);

export const createProjectSchema = z.object({
  code: z.string().min(1, "El código es obligatorio").max(50),
  name: z.string().min(1, "El nombre es obligatorio").max(255),
  description: z.string().max(2000).optional(),
  clientContactId: z.string().uuid("Seleccione un cliente válido"),
  type: projectTypeSchema,
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  startDate: z.coerce.date().optional(),
  expectedEndDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  clientContactId: z.string().uuid().optional(),
  type: projectTypeSchema.optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  startDate: z.coerce.date().optional(),
  expectedEndDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export const listProjectsSchema = z.object({
  status: projectStatusSchema.optional(),
  search: z.string().max(200).optional(),
  clientContactId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsInput = z.infer<typeof listProjectsSchema>;
