import { z } from "zod";
import { moneyAmountString, qtyString } from "./money";

export const budgetStatusSchema = z.enum([
  "DRAFT", "IN_REVIEW", "RETURNED_FOR_CHANGES", "APPROVED", "CLOSED", "CANCELLED",
]);
export const wbsNodeTypeSchema = z.enum(["GROUP", "ITEM"]);
export const costCategorySchema = z.enum(["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT", "OTHER"]);

/** Spreadsheet/JSON may send number or string — never keep raw JS float for money/qty. */
function optionalImportDecimal(schema: z.ZodType<string>) {
  return z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return v;
      return String(v);
    }
    if (typeof v === "string") return v.trim() === "" ? undefined : v;
    return v;
  }, schema.optional());
}

const optionalImportMoney = optionalImportDecimal(
  moneyAmountString.refine((v) => !v.startsWith("-"), "El monto no puede ser negativo"),
);
const optionalImportQty = optionalImportDecimal(
  qtyString.refine((v) => !v.startsWith("-"), "La cantidad no puede ser negativa"),
);

export const createBudgetSchema = z.object({
  projectId: z.string().uuid("Proyecto inválido"),
  name: z.string().min(1, "El nombre es obligatorio").max(255),
  currency: z.string().length(3).optional(),
  internalNotes: z.string().max(2000).optional(),
  /** Complementary budget / phase ([D-002], [BR-BUD-001]): points at parent APPROVED|CLOSED. */
  parentBudgetId: z.string().uuid().optional().nullable(),
  overheadPct: z.number().min(0).max(100).optional(),
  financialCostPct: z.number().min(0).max(100).optional(),
  financialDaysAvg: z.number().int().min(0).optional(),
  profitPct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
});

export const updateBudgetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  internalNotes: z.string().max(2000).optional(),
});

export const updateBudgetSettingsSchema = z.object({
  overheadPct: z.number().min(0).max(100).optional(),
  financialCostPct: z.number().min(0).max(100).optional(),
  financialDaysAvg: z.number().int().min(0).optional(),
  profitPct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
});

/** Comentario opcional al avanzar el ciclo de vida del presupuesto. */
export const budgetLifecycleCommentSchema = z.object({
  comment: z.string().max(2000).optional(),
});

/** Observaciones obligatorias al devolver un presupuesto en revisión. */
export const budgetReturnForChangesSchema = z.object({
  comment: z.string().min(1, "Las observaciones son obligatorias").max(2000),
});

export const subdivideApuSchema = z.enum(["migrate", "discard"]);

export const createWbsNodeSchema = z.object({
  parentId: z.string().uuid().optional(),
  type: wbsNodeTypeSchema,
  /** Si se omite, el servicio asigna el siguiente código según padre y tipo. */
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1, "El nombre es obligatorio").max(255),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  unit: z.string().max(50).optional(),
  quantity: z.number().min(0).optional(),
  /** Al agregar hijo bajo un ítem hoja con APU: migrar CostItem al hijo o descartarlo. */
  subdivideApu: subdivideApuSchema.optional(),
});

export const updateWbsNodeSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
});

export const reorderWbsNodesSchema = z.object({
  parentId: z.string().uuid().nullable(),
  orderedNodeIds: z.array(z.string().uuid()).min(1),
});

export const updateCostItemSchema = z.object({
  unit: z.string().max(50).optional(),
  /** Qty 0 breaks lump APU recompute (partida money); require positive when set. */
  quantity: z.number().positive("La cantidad debe ser mayor a 0").optional(),
  notes: z.string().max(2000).optional(),
});

export const createCostAnalysisLineSchema = z.object({
  costItemId: z.string().uuid(),
  category: costCategorySchema,
  description: z.string().min(1, "La descripción es obligatoria").max(500),
  unit: z.string().min(1, "La unidad es obligatoria").max(50),
  coefficient: z.number().min(0),
  unitCost: z.number().min(0),
  /** Authoritative unit contribution; if omitted, coefficient × unitCost. */
  totalCost: z.number().min(0).optional(),
  /** Absolute resource qty for whole partida ([D-047]); null/omit = Por unidad. */
  partidaQuantity: z.number().min(0).nullable().optional(),
  isLumpSum: z.boolean().optional(),
  /** Catalog product for materials → OC / inventory traceability. */
  productId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  supplierContactId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateCostAnalysisLineSchema = z.object({
  category: costCategorySchema.optional(),
  description: z.string().min(1).max(500).optional(),
  unit: z.string().min(1).max(50).optional(),
  coefficient: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  totalCost: z.number().min(0).optional(),
  partidaQuantity: z.number().min(0).nullable().optional(),
  isLumpSum: z.boolean().optional(),
  productId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  supplierContactId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

/** Atomic APU save: cost item fields + full line sync ([D-047] C4). */
export const saveCostItemApuSchema = z.object({
  costItemId: z.string().uuid(),
  unit: z.string().max(50).optional(),
  quantity: z.number().positive("La cantidad debe ser mayor a 0").optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z.array(
    z.object({
      id: z.string().uuid().optional(),
      category: costCategorySchema,
      description: z.string().min(1).max(500),
      unit: z.string().min(1).max(50),
      coefficient: z.number().min(0),
      unitCost: z.number().min(0),
      totalCost: z.number().min(0),
      partidaQuantity: z.number().min(0).nullable().optional(),
      isLumpSum: z.boolean().optional(),
      productId: z.string().uuid().nullable().optional(),
      sortOrder: z.number().int().min(0).optional(),
      notes: z.string().max(2000).nullable().optional(),
      _delete: z.boolean().optional(),
    }),
  ),
});

// ─── CSV Import ───────────────────────────────────────────────────────────────

export const IMPORT_TEMPLATE_COLUMNS = [
  "code", "parent_code", "type", "name", "description",
  "unit", "quantity", "material_cost", "labor_cost",
  "equipment_cost", "subcontract_cost", "other_cost", "notes",
] as const;

export const budgetImportRowSchema = z.object({
  code: z.string().min(1).max(50),
  parent_code: z.string().max(50).optional(),
  type: wbsNodeTypeSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  unit: z.string().max(50).optional(),
  quantity: optionalImportQty,
  material_cost: optionalImportMoney,
  labor_cost: optionalImportMoney,
  equipment_cost: optionalImportMoney,
  subcontract_cost: optionalImportMoney,
  other_cost: optionalImportMoney,
  notes: z.string().max(2000).optional(),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type UpdateBudgetSettingsInput = z.infer<typeof updateBudgetSettingsSchema>;
export type SubdivideApuChoice = z.infer<typeof subdivideApuSchema>;
export type CreateWbsNodeInput = z.infer<typeof createWbsNodeSchema>;
export type UpdateWbsNodeInput = z.infer<typeof updateWbsNodeSchema>;
export type ReorderWbsNodesInput = z.infer<typeof reorderWbsNodesSchema>;
export type UpdateCostItemInput = z.infer<typeof updateCostItemSchema>;
export type CreateCostAnalysisLineInput = z.infer<typeof createCostAnalysisLineSchema>;
export type UpdateCostAnalysisLineInput = z.infer<typeof updateCostAnalysisLineSchema>;
export type SaveCostItemApuInput = z.infer<typeof saveCostItemApuSchema>;
export type BudgetLifecycleCommentInput = z.infer<typeof budgetLifecycleCommentSchema>;
export type BudgetReturnForChangesInput = z.infer<typeof budgetReturnForChangesSchema>;
export type BudgetImportRow = z.infer<typeof budgetImportRowSchema>;
