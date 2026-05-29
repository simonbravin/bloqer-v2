"use server";

import {
  createBudget, updateBudget,
  submitBudgetForReview, returnBudgetForChanges, approveBudget, closeBudget, cancelBudget,
  updateBudgetSettings,
  addWbsNode, updateWbsNode, removeWbsNode, reorderWbsNodes, ensureWbsLeafForApu,
  previewImport, executeImport,
  updateCostItem,
  addCostAnalysisLine, updateCostAnalysisLine, removeCostAnalysisLine,
  ServiceError,
} from "@bloqer/services";
import {
  createBudgetSchema, updateBudgetSchema, updateBudgetSettingsSchema,
  createWbsNodeSchema, updateWbsNodeSchema, reorderWbsNodesSchema,
  updateCostItemSchema, createCostAnalysisLineSchema, updateCostAnalysisLineSchema,
  type CreateBudgetInput, type UpdateBudgetInput, type UpdateBudgetSettingsInput,
  type CreateWbsNodeInput, type UpdateWbsNodeInput, type ReorderWbsNodesInput,
  type UpdateCostItemInput,   type CreateCostAnalysisLineInput, type UpdateCostAnalysisLineInput,
  budgetImportRowSchema,
  budgetLifecycleCommentSchema, budgetReturnForChangesSchema,
  type BudgetImportRow,
  type BudgetLifecycleCommentInput, type BudgetReturnForChangesInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type Ok = { ok: true };
type Err = { error: string };

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  return {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
}

function handle(err: unknown): Err {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export async function createBudgetAction(
  projectId: string,
  data: CreateBudgetInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createBudgetSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const budget = await createBudget(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos`);
    return { id: budget.id };
  } catch (err) { return handle(err); }
}

export async function updateBudgetAction(
  budgetId: string,
  projectId: string,
  data: UpdateBudgetInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateBudgetSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateBudget(budgetId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function updateBudgetSettingsAction(
  budgetId: string,
  projectId: string,
  data: UpdateBudgetSettingsInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateBudgetSettingsSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateBudgetSettings(budgetId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos`);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

async function lifecycleAction(
  budgetId: string,
  projectId: string,
  fn: (id: string, ctx: Awaited<ReturnType<typeof getCtx>>, input?: { comment?: string }) => Promise<unknown>,
  input?: { comment?: string },
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await fn(budgetId, ctx, input);
    revalidatePath(`/proyectos/${projectId}/presupuestos`);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function submitForReviewAction(
  budgetId: string,
  projectId: string,
  data?: BudgetLifecycleCommentInput,
) {
  if (data) {
    const parsed = budgetLifecycleCommentSchema.safeParse(data);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    return lifecycleAction(budgetId, projectId, submitBudgetForReview, parsed.data);
  }
  return lifecycleAction(budgetId, projectId, submitBudgetForReview);
}

export async function returnForChangesAction(
  budgetId: string,
  projectId: string,
  data: BudgetReturnForChangesInput,
) {
  const parsed = budgetReturnForChangesSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  return lifecycleAction(budgetId, projectId, returnBudgetForChanges, parsed.data);
}

export async function approveBudgetAction(
  budgetId: string,
  projectId: string,
  data?: BudgetLifecycleCommentInput,
) {
  if (data) {
    const parsed = budgetLifecycleCommentSchema.safeParse(data);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    return lifecycleAction(budgetId, projectId, approveBudget, parsed.data);
  }
  return lifecycleAction(budgetId, projectId, approveBudget);
}

export async function closeBudgetAction(
  budgetId: string,
  projectId: string,
  data?: BudgetLifecycleCommentInput,
) {
  if (data) {
    const parsed = budgetLifecycleCommentSchema.safeParse(data);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    return lifecycleAction(budgetId, projectId, closeBudget, parsed.data);
  }
  return lifecycleAction(budgetId, projectId, closeBudget);
}

export async function cancelBudgetAction(
  budgetId: string,
  projectId: string,
  data?: BudgetLifecycleCommentInput,
) {
  if (data) {
    const parsed = budgetLifecycleCommentSchema.safeParse(data);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    return lifecycleAction(budgetId, projectId, cancelBudget, parsed.data);
  }
  return lifecycleAction(budgetId, projectId, cancelBudget);
}

// ─── WBS ──────────────────────────────────────────────────────────────────────

export async function ensureWbsLeafForApuAction(
  budgetId: string,
  projectId: string,
  nodeId: string,
): Promise<{ node: Awaited<ReturnType<typeof ensureWbsLeafForApu>> } | Err> {
  const ctx = await getCtx();
  try {
    const node = await ensureWbsLeafForApu(budgetId, nodeId, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { node };
  } catch (err) {
    return handle(err);
  }
}

export async function addWbsNodeAction(
  budgetId: string,
  projectId: string,
  data: CreateWbsNodeInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createWbsNodeSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const result = await addWbsNode(budgetId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return result;
  } catch (err) { return handle(err); }
}

export async function updateWbsNodeAction(
  projectId: string,
  budgetId: string,
  nodeId: string,
  data: UpdateWbsNodeInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateWbsNodeSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateWbsNode(nodeId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function removeWbsNodeAction(
  projectId: string,
  budgetId: string,
  nodeId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await removeWbsNode(nodeId, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function reorderWbsNodesAction(
  budgetId: string,
  projectId: string,
  data: ReorderWbsNodesInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = reorderWbsNodesSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await reorderWbsNodes(budgetId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function previewWbsImportAction(
  budgetId: string,
  projectId: string,
  rawRows: unknown[][],
) {
  const ctx = await getCtx();
  try {
    const result = await previewImport(budgetId, rawRows, ctx, "structure_only");
    return result;
  } catch (err) {
    return handle(err);
  }
}

/** Import WBS tras crear presupuesto (budgetId dinámico; evita arrow inline en RSC). */
export async function executeWbsImportOnCreateAction(
  projectId: string,
  budgetId: string,
  rows: BudgetImportRow[],
): Promise<{ createdNodes: number; createdItems: number } | Err> {
  return executeWbsImportAction(budgetId, projectId, rows, { replaceExisting: false });
}

export async function executeWbsImportAction(
  budgetId: string,
  projectId: string,
  rows: BudgetImportRow[],
  options: { replaceExisting: boolean },
): Promise<{ createdNodes: number; createdItems: number } | Err> {
  const ctx = await getCtx();
  const parsed = rows.map((r) => budgetImportRowSchema.safeParse(r));
  if (parsed.some((p) => !p.success)) {
    return { error: "Hay filas inválidas en la importación" };
  }
  const validRows = parsed.map((p) => p.data!);
  try {
    const result = await executeImport(budgetId, validRows, ctx, {
      mode: "structure_only",
      replaceExisting: options.replaceExisting,
    });
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return result;
  } catch (err) {
    return handle(err);
  }
}

// ─── CostItem ─────────────────────────────────────────────────────────────────

export async function updateCostItemAction(
  projectId: string,
  budgetId: string,
  costItemId: string,
  data: UpdateCostItemInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateCostItemSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateCostItem(costItemId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

// ─── CostAnalysisLines ────────────────────────────────────────────────────────

export async function addCostAnalysisLineAction(
  projectId: string,
  budgetId: string,
  data: CreateCostAnalysisLineInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createCostAnalysisLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const line = await addCostAnalysisLine(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { id: line.id };
  } catch (err) { return handle(err); }
}

export async function updateCostAnalysisLineAction(
  projectId: string,
  budgetId: string,
  lineId: string,
  data: UpdateCostAnalysisLineInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateCostAnalysisLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateCostAnalysisLine(lineId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function removeCostAnalysisLineAction(
  projectId: string,
  budgetId: string,
  lineId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await removeCostAnalysisLine(lineId, ctx);
    revalidatePath(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}
