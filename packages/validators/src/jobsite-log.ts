import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Debe ser un número positivo");
const pctString     = z.string().regex(/^\d+(\.\d+)?$/).optional().nullable();

const progressLineSchema = z.object({
  wbsNodeId:         z.string().uuid(),
  description:       z.string().optional().nullable(),
  quantityCompleted: decimalString,
  physicalPct:       pctString,
  notes:             z.string().optional().nullable(),
  sortOrder:         z.number().int().optional(),
});

const laborLineSchema = z.object({
  contactId:       z.string().uuid().optional().nullable(),
  subcontractId:   z.string().uuid().optional().nullable(),
  crewDescription: z.string().optional().nullable(),
  workersCount:    z.number().int().min(1, "Debe haber al menos 1 trabajador"),
  hoursWorked:     z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
  notes:           z.string().optional().nullable(),
  sortOrder:       z.number().int().optional(),
});

const materialLineSchema = z.object({
  productId:   z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, "La descripción es requerida"),
  quantity:    decimalString,
  notes:       z.string().optional().nullable(),
  sortOrder:   z.number().int().optional(),
});

const issueLineSchema = z.object({
  type:        z.enum(["INCIDENT", "BLOCKER", "SAFETY", "OTHER"]),
  severity:    z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  description: z.string().min(1, "La descripción es requerida"),
  status:      z.enum(["OPEN", "RESOLVED", "ESCALATED"]).optional(),
  notes:       z.string().optional().nullable(),
  sortOrder:   z.number().int().optional(),
});

export const createJobsiteLogSchema = z.object({
  projectId:    z.string().uuid(),
  companyId:    z.string().uuid(),
  logDate:      z.string().min(1, "La fecha es requerida"),
  title:        z.string().optional().nullable(),
  workFront:    z.string().optional().nullable(),
  shift:        z.string().optional().nullable(),
  weather:      z.string().optional().nullable(),
  generalNotes: z.string().optional().nullable(),
  blockers:     z.string().optional().nullable(),
  incidents:    z.string().optional().nullable(),
  safetyNotes:  z.string().optional().nullable(),
  progress:     z.array(progressLineSchema).optional().default([]),
  labor:        z.array(laborLineSchema).optional().default([]),
  materials:    z.array(materialLineSchema).optional().default([]),
  issues:       z.array(issueLineSchema).optional().default([]),
});

export const updateJobsiteLogSchema = createJobsiteLogSchema.omit({ projectId: true, companyId: true, logDate: true }).extend({
  logDate: z.string().optional(),
});

export const returnJobsiteLogSchema = z.object({
  returnNotes: z.string().min(1, "Las observaciones son requeridas para devolver el parte"),
});

export type CreateJobsiteLogInput = z.infer<typeof createJobsiteLogSchema>;
export type UpdateJobsiteLogInput = z.infer<typeof updateJobsiteLogSchema>;
export type ReturnJobsiteLogInput = z.infer<typeof returnJobsiteLogSchema>;
