import { z } from "zod";

export const certificationStatusSchema = z.enum([
  "DRAFT", "ISSUED", "APPROVED", "REJECTED", "CANCELLED",
]);

export const createCertificationSchema = z.object({
  projectId:     z.string().uuid("Proyecto inválido"),
  budgetId:      z.string().uuid("Presupuesto inválido"),
  periodStart:   z.string().min(1, "La fecha de inicio es obligatoria"),
  periodEnd:     z.string().min(1, "La fecha de fin es obligatoria"),
  notes:         z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
});

export const updateCertificationSchema = z.object({
  periodStart:   z.string().optional(),
  periodEnd:     z.string().optional(),
  notes:         z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
});

export const addCertificationLineSchema = z.object({
  certificationId: z.string().uuid(),
  wbsNodeId:       z.string().uuid("Nodo WBS inválido"),
  physicalPct:     z.number().min(0).max(100),
  currentQty:      z.number().min(0),
  notes:           z.string().max(2000).optional(),
  sortOrder:       z.number().int().min(0).optional(),
});

export const updateCertificationLineSchema = z.object({
  physicalPct: z.number().min(0).max(100).optional(),
  currentQty:  z.number().min(0).optional(),
  notes:       z.string().max(2000).optional(),
  sortOrder:   z.number().int().min(0).optional(),
});

export type CreateCertificationInput  = z.infer<typeof createCertificationSchema>;
export type UpdateCertificationInput  = z.infer<typeof updateCertificationSchema>;
export type AddCertificationLineInput    = z.infer<typeof addCertificationLineSchema>;
export type UpdateCertificationLineInput = z.infer<typeof updateCertificationLineSchema>;
