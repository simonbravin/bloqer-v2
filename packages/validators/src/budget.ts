import { z } from "zod";

export const budgetStatusSchema = z.enum([
  "DRAFT", "IN_REVIEW", "RETURNED_FOR_CHANGES", "APPROVED", "CLOSED", "CANCELLED",
]);
export const wbsNodeTypeSchema = z.enum(["GROUP", "ITEM"]);
export const costCategorySchema = z.enum(["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT", "OTHER"]);

export const createBudgetSchema = z.object({
  projectId: z.string().uuid("Proyecto inválido"),
  name: z.string().min(1, "El nombre es obligatorio").max(255),
  currency: z.string().length(3).optional(),
  internalNotes: z.string().max(2000).optional(),
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
  notes: z.string().max(2000).optional(),
});

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
  quantity: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export const createCostAnalysisLineSchema = z.object({
  costItemId: z.string().uuid(),
  category: costCategorySchema,
  description: z.string().min(1, "La descripción es obligatoria").max(500),
  unit: z.string().min(1, "La unidad es obligatoria").max(50),
  coefficient: z.number().min(0),
  unitCost: z.number().min(0),
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
  sortOrder: z.number().int().min(0).optional(),
  supplierContactId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
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
  quantity: z.coerce.number().min(0).optional(),
  material_cost: z.coerce.number().min(0).optional(),
  labor_cost: z.coerce.number().min(0).optional(),
  equipment_cost: z.coerce.number().min(0).optional(),
  subcontract_cost: z.coerce.number().min(0).optional(),
  other_cost: z.coerce.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type UpdateBudgetSettingsInput = z.infer<typeof updateBudgetSettingsSchema>;
export type CreateWbsNodeInput = z.infer<typeof createWbsNodeSchema>;
export type UpdateWbsNodeInput = z.infer<typeof updateWbsNodeSchema>;
export type ReorderWbsNodesInput = z.infer<typeof reorderWbsNodesSchema>;
export type UpdateCostItemInput = z.infer<typeof updateCostItemSchema>;
export type CreateCostAnalysisLineInput = z.infer<typeof createCostAnalysisLineSchema>;
export type UpdateCostAnalysisLineInput = z.infer<typeof updateCostAnalysisLineSchema>;
export type BudgetImportRow = z.infer<typeof budgetImportRowSchema>;
