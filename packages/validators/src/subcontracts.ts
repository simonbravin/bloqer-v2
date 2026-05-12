import { z } from "zod";

const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Debe ser un número positivo");

const subcontractLineSchema = z.object({
  wbsNodeId:   z.string().uuid().optional().nullable(),
  description: z.string().min(1, "La descripción es requerida"),
  unit:        z.string().default(""),
  quantity:    decimalString,
  unitPrice:   decimalString,
  notes:       z.string().optional().nullable(),
  sortOrder:   z.number().int().optional(),
});

export const createSubcontractSchema = z.object({
  companyId:              z.string().uuid(),
  projectId:              z.string().uuid(),
  subcontractorContactId: z.string().uuid(),
  title:                  z.string().min(1, "El título es requerido"),
  description:            z.string().optional().nullable(),
  contractDate:           z.string().min(1, "La fecha de contrato es requerida"),
  startDate:              z.string().optional().nullable(),
  expectedEndDate:        z.string().optional().nullable(),
  currency:               z.string().default("ARS"),
  notes:                  z.string().optional().nullable(),
  internalNotes:          z.string().optional().nullable(),
  lines:                  z.array(subcontractLineSchema).min(1, "Se requiere al menos una línea"),
});

export const updateSubcontractSchema = z.object({
  title:          z.string().min(1).optional(),
  description:    z.string().optional().nullable(),
  contractDate:   z.string().optional(),
  startDate:      z.string().optional().nullable(),
  expectedEndDate: z.string().optional().nullable(),
  notes:          z.string().optional().nullable(),
  internalNotes:  z.string().optional().nullable(),
  lines:          z.array(subcontractLineSchema).optional(),
});

export const updateSubcontractMetaSchema = z.object({
  notes:          z.string().optional().nullable(),
  internalNotes:  z.string().optional().nullable(),
  expectedEndDate: z.string().optional().nullable(),
  startDate:      z.string().optional().nullable(),
});

const certificationLineInputSchema = z.object({
  subcontractLineId: z.string().uuid(),
  currentQty:        decimalString,
  notes:             z.string().optional().nullable(),
});

export const createSubcontractCertificationSchema = z.object({
  subcontractId:    z.string().uuid(),
  periodStart:      z.string().min(1, "La fecha de inicio es requerida"),
  periodEnd:        z.string().min(1, "La fecha de fin es requerida"),
  certificationDate: z.string().min(1, "La fecha de certificación es requerida"),
  notes:            z.string().optional().nullable(),
  lines:            z.array(certificationLineInputSchema).min(1, "Se requiere al menos una línea"),
});

export const updateSubcontractCertificationSchema = z.object({
  periodStart:       z.string().optional(),
  periodEnd:         z.string().optional(),
  certificationDate: z.string().optional(),
  notes:             z.string().optional().nullable(),
  lines:             z.array(certificationLineInputSchema).optional(),
});

export type CreateSubcontractInput              = z.infer<typeof createSubcontractSchema>;
export type UpdateSubcontractInput              = z.infer<typeof updateSubcontractSchema>;
export type UpdateSubcontractMetaInput          = z.infer<typeof updateSubcontractMetaSchema>;
export type CreateSubcontractCertificationInput = z.infer<typeof createSubcontractCertificationSchema>;
export type UpdateSubcontractCertificationInput = z.infer<typeof updateSubcontractCertificationSchema>;
