import { z } from "zod";
import {
  RICH_NOTE_MAX_CHARS,
  RICH_NOTE_RAW_MAX,
  normalizeRichNote,
  roundQty,
  roundToDecimals,
} from "@bloqer/utils";
import { idempotencyKeySchema } from "./idempotency";

const generalNotesSchema = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null || v === "") return null;
    if (typeof v !== "string") return v;
    if (v.length > RICH_NOTE_RAW_MAX) return v;
    return normalizeRichNote(v);
  },
  z
    .string()
    .max(RICH_NOTE_MAX_CHARS, "Las notas generales son demasiado largas")
    .nullable()
    .optional(),
);

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Debe ser un número positivo");
const quantityString = decimalString.pipe(
  z.string().refine((value) => roundQty(value).split(".")[0]!.length <= 14, "Cantidad fuera de rango"),
);
const hoursString = decimalString.pipe(
  z.string().refine((value) => roundToDecimals(value, 2).split(".")[0]!.length <= 6, "Horas fuera de rango"),
);
const pctString     = z.string().regex(/^\d+(\.\d+)?$/).optional().nullable();
const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647).optional();
export const jobsiteLogDateSchema = z.string().date("Ingresá una fecha válida");

const progressLineSchema = z.object({
  wbsNodeId:         z.string().guid(),
  description:       z.string().optional().nullable(),
  quantityCompleted: quantityString,
  physicalPct:       pctString,
  notes:             z.string().optional().nullable(),
  sortOrder:         sortOrderSchema,
});

const laborLineSchema = z.object({
  contactId:       z.string().guid().optional().nullable(),
  subcontractId:   z.string().guid().optional().nullable(),
  crewDescription: z.string().optional().nullable(),
  workersCount:    z.number().int().min(1, "Debe haber al menos 1 trabajador").max(2_147_483_647, "Cantidad de trabajadores fuera de rango"),
  hoursWorked:     hoursString.optional().nullable(),
  notes:           z.string().optional().nullable(),
  sortOrder:       sortOrderSchema,
});

const materialLineSchema = z.object({
  productId:   z.string().guid().optional().nullable(),
  warehouseId: z.string().guid().optional().nullable(),
  /** Preferred for inventory consumption imputation ([D-055]). */
  wbsNodeId:   z.string().guid().optional().nullable(),
  description: z.string().trim().min(1, "La descripción es requerida"),
  quantity:    quantityString,
  notes:       z.string().optional().nullable(),
  sortOrder:   sortOrderSchema,
}).refine(
  (row) =>
    !row.productId || !row.warehouseId || !decimalString.safeParse(row.quantity).success ||
    roundQty(row.quantity) !== "0.0000",
  { path: ["quantity"], message: "La cantidad del material con producto y depósito debe ser mayor a cero" },
);

const issueLineSchema = z.object({
  type:        z.enum(["INCIDENT", "BLOCKER", "SAFETY", "OTHER"]),
  severity:    z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  description: z.string().trim().min(1, "La descripción es requerida"),
  status:      z.enum(["OPEN", "RESOLVED", "ESCALATED"]).optional(),
  notes:       z.string().optional().nullable(),
  sortOrder:   sortOrderSchema,
});

export const createJobsiteLogSchema = z.object({
  projectId:    z.string().guid(),
  /** Optional: service resolves from project / membership / first ACTIVE company. */
  companyId:    z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().guid().optional(),
  ),
  logDate:      jobsiteLogDateSchema,
  title:        z.string().optional().nullable(),
  workFront:    z.string().optional().nullable(),
  shift:        z.string().optional().nullable(),
  weather:      z.string().optional().nullable(),
  generalNotes: generalNotesSchema,
  blockers:     z.string().optional().nullable(),
  incidents:    z.string().optional().nullable(),
  safetyNotes:  z.string().optional().nullable(),
  progress:     z.array(progressLineSchema).optional().default([]),
  labor:        z.array(laborLineSchema).optional().default([]),
  materials:    z.array(materialLineSchema).optional().default([]),
  issues:       z.array(issueLineSchema).optional().default([]),
  idempotencyKey: idempotencyKeySchema,
});

export const updateJobsiteLogSchema = createJobsiteLogSchema
  .omit({ projectId: true, companyId: true, logDate: true, idempotencyKey: true })
  .extend({
    logDate: jobsiteLogDateSchema.optional(),
  });

export const returnJobsiteLogSchema = z.object({
  returnNotes: z.string().trim().min(1, "Las observaciones son requeridas para devolver el parte"),
});

export type CreateJobsiteLogInput = z.infer<typeof createJobsiteLogSchema>;
export type UpdateJobsiteLogInput = z.infer<typeof updateJobsiteLogSchema>;
export type ReturnJobsiteLogInput = z.infer<typeof returnJobsiteLogSchema>;
