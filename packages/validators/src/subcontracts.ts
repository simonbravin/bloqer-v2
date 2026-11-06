import { z } from "zod";
import { positiveQtyString, qtyString } from "./money";

const fitsStorage = (value: string) => value.split(".")[0]!.replace(/^0+/, "").length <= 14;
const quantity = positiveQtyString.refine(fitsStorage, "Cantidad fuera de rango");
// Service/API values are canonical decimal strings, not locale-formatted money.
const unitPrice = qtyString.refine(fitsStorage, "Precio fuera de rango");
const calendarDate = z.string().date("Ingresá una fecha válida");
const optionalDate = z.preprocess(
  (value) => (value === "" ? null : value),
  calendarDate.optional().nullable(),
);
const dateRange = (
  start: string | null | undefined,
  end: string | null | undefined,
  ctx: z.RefinementCtx,
  field: string,
) => {
  if (start && end && start > end)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: "La fecha de fin debe ser igual o posterior al inicio",
    });
};

const subcontractLineSchema = z.object({
  wbsNodeId: z.string().guid().optional().nullable(),
  description: z.string().trim().min(1, "La descripción es requerida"),
  unit: z.string().default(""),
  quantity,
  unitPrice,
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).max(2_147_483_647).optional(),
});

export const createSubcontractSchema = z
  .object({
    companyId: z.string().guid(),
    projectId: z.string().guid(),
    subcontractorContactId: z.string().guid(),
    title: z.string().trim().min(1, "El título es requerido"),
    description: z.string().optional().nullable(),
    contractDate: calendarDate,
    startDate: optionalDate,
    expectedEndDate: optionalDate,
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Moneda inválida")
      .default("ARS"),
    notes: z.string().optional().nullable(),
    internalNotes: z.string().optional().nullable(),
    lines: z.array(subcontractLineSchema).min(1, "Se requiere al menos una línea"),
  })
  .superRefine((value, ctx) =>
    dateRange(value.startDate, value.expectedEndDate, ctx, "expectedEndDate"),
  );

export const updateSubcontractSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().optional().nullable(),
    contractDate: calendarDate.optional(),
    startDate: optionalDate,
    expectedEndDate: optionalDate,
    notes: z.string().optional().nullable(),
    internalNotes: z.string().optional().nullable(),
    lines: z.array(subcontractLineSchema).min(1, "Se requiere al menos una línea").optional(),
  })
  .superRefine((value, ctx) =>
    dateRange(value.startDate, value.expectedEndDate, ctx, "expectedEndDate"),
  );

export const updateSubcontractMetaSchema = z
  .object({
    notes: z.string().optional().nullable(),
    internalNotes: z.string().optional().nullable(),
    expectedEndDate: optionalDate,
    startDate: optionalDate,
  })
  .superRefine((value, ctx) =>
    dateRange(value.startDate, value.expectedEndDate, ctx, "expectedEndDate"),
  );

const certificationLineInputSchema = z.object({
  subcontractLineId: z.string().guid(),
  currentQty: quantity,
  notes: z.string().optional().nullable(),
});
const certificationLines = z
  .array(certificationLineInputSchema)
  .min(1, "Se requiere al menos una línea")
  .superRefine((lines, ctx) => {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (seen.has(line.subcontractLineId))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "subcontractLineId"],
          message: "Cada línea del subcontrato debe aparecer una sola vez",
        });
      seen.add(line.subcontractLineId);
    });
  });

export const createSubcontractCertificationSchema = z
  .object({
    subcontractId: z.string().guid(),
    periodStart: calendarDate,
    periodEnd: calendarDate,
    certificationDate: calendarDate,
    notes: z.string().optional().nullable(),
    replacesCertificationId: z.string().guid().optional().nullable(),
    lines: certificationLines,
  })
  .superRefine((value, ctx) => dateRange(value.periodStart, value.periodEnd, ctx, "periodEnd"));

export const updateSubcontractCertificationSchema = z
  .object({
    periodStart: calendarDate.optional(),
    periodEnd: calendarDate.optional(),
    certificationDate: calendarDate.optional(),
    notes: z.string().optional().nullable(),
    lines: certificationLines.optional(),
  })
  .superRefine((value, ctx) => dateRange(value.periodStart, value.periodEnd, ctx, "periodEnd"));

/** BR-AUD-003: requiredness depends on the document's existing state, checked in its service. */
export const cancelSubcontractSchema = z.object({ reason: z.string().trim().max(2000).optional() });

export type CreateSubcontractInput = z.infer<typeof createSubcontractSchema>;
export type UpdateSubcontractInput = z.infer<typeof updateSubcontractSchema>;
export type UpdateSubcontractMetaInput = z.infer<typeof updateSubcontractMetaSchema>;
export type CreateSubcontractCertificationInput = z.infer<
  typeof createSubcontractCertificationSchema
>;
export type UpdateSubcontractCertificationInput = z.infer<
  typeof updateSubcontractCertificationSchema
>;
