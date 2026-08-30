"use server";

import {
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  returnPurchaseOrder,
  confirmPurchaseOrder,
  authorizeAndCommitPurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseReceipt,
  confirmPurchaseReceipt,
  cancelPurchaseReceipt,
  getPurchaseOrderById,
  getPurchaseReceiptById,
  ServiceError,
} from "@bloqer/services";
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  createPurchaseReceiptSchema,
  returnPurchaseOrderSchema,
  type CreatePurchaseOrderInput,
  type UpdatePurchaseOrderInput,
  type CreatePurchaseReceiptInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { revalidateProjectCostAndFinancePaths } from "@/lib/revalidate-project-paths";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };
}

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

function revalidatePO(projectId: string, poId?: string) {
  revalidatePath(`/proyectos/${projectId}/ordenes-compra`);
  if (poId) revalidatePath(`/proyectos/${projectId}/ordenes-compra/${poId}`);
  revalidatePath("/pendientes");
  revalidateProjectCostAndFinancePaths(projectId);
}

async function assertPoBelongsToProject(
  poId: string,
  projectId: string,
  ctx: Awaited<ReturnType<typeof getCtx>>,
): Promise<{ error: string } | null> {
  try {
    const po = await getPurchaseOrderById(poId, ctx);
    if (po.projectId !== projectId) {
      return { error: "La orden de compra no pertenece a este proyecto" };
    }
    return null;
  } catch (err) {
    return handle(err);
  }
}

export async function createPurchaseOrderAction(
  projectId: string,
  data: CreatePurchaseOrderInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPurchaseOrderSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  if (parsed.data.projectId !== projectId) {
    return { error: "La orden no pertenece a este proyecto" };
  }
  try {
    const po = await createPurchaseOrder(parsed.data, ctx);
    revalidatePO(projectId);
    return { id: po.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updatePurchaseOrderAction(
  poId: string,
  projectId: string,
  data: UpdatePurchaseOrderInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const mismatch = await assertPoBelongsToProject(poId, projectId, ctx);
  if (mismatch) return mismatch;
  const parsed = updatePurchaseOrderSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const po = await updatePurchaseOrder(poId, parsed.data, ctx);
    revalidatePO(projectId, poId);
    return { id: po.id };
  } catch (err) {
    return handle(err);
  }
}

export async function submitPurchaseOrderAction(
  poId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const mismatch = await assertPoBelongsToProject(poId, projectId, ctx);
  if (mismatch) return mismatch;
  try {
    await submitPurchaseOrder(poId, ctx);
    revalidatePO(projectId, poId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function approvePurchaseOrderAction(
  poId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const mismatch = await assertPoBelongsToProject(poId, projectId, ctx);
  if (mismatch) return mismatch;
  try {
    await approvePurchaseOrder(poId, ctx);
    revalidatePO(projectId, poId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function returnPurchaseOrderAction(
  poId: string,
  projectId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const mismatch = await assertPoBelongsToProject(poId, projectId, ctx);
  if (mismatch) return mismatch;
  const parsed = returnPurchaseOrderSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await returnPurchaseOrder(poId, parsed.data.reason, ctx);
    revalidatePO(projectId, poId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function confirmPurchaseOrderAction(
  poId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const mismatch = await assertPoBelongsToProject(poId, projectId, ctx);
  if (mismatch) return mismatch;
  try {
    await confirmPurchaseOrder(poId, ctx);
    revalidatePO(projectId, poId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function authorizeAndCommitPurchaseOrderAction(
  poId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const mismatch = await assertPoBelongsToProject(poId, projectId, ctx);
  if (mismatch) return mismatch;
  try {
    await authorizeAndCommitPurchaseOrder(poId, ctx);
    revalidatePO(projectId, poId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelPurchaseOrderAction(
  poId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const mismatch = await assertPoBelongsToProject(poId, projectId, ctx);
  if (mismatch) return mismatch;
  try {
    await cancelPurchaseOrder(poId, ctx);
    revalidatePO(projectId, poId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createPurchaseReceiptAction(
  projectId: string,
  data: CreatePurchaseReceiptInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPurchaseReceiptSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const mismatch = await assertPoBelongsToProject(parsed.data.purchaseOrderId, projectId, ctx);
  if (mismatch) return mismatch;
  try {
    const receipt = await createPurchaseReceipt(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/recepciones`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${data.purchaseOrderId}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { id: receipt.id };
  } catch (err) {
    return handle(err);
  }
}

export async function confirmPurchaseReceiptAction(
  receiptId: string,
  projectId: string,
  purchaseOrderId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    const receipt = await getPurchaseReceiptById(receiptId, ctx);
    if (receipt.projectId !== projectId || receipt.purchaseOrderId !== purchaseOrderId) {
      return { error: "La recepción no pertenece a este proyecto u orden" };
    }
    await confirmPurchaseReceipt(receiptId, ctx);
    revalidatePath(`/proyectos/${projectId}/recepciones`);
    revalidatePath(`/proyectos/${projectId}/recepciones/${receiptId}`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${purchaseOrderId}`);
    revalidatePath("/pendientes");
    revalidatePath(`/proyectos/${projectId}/pendientes`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelPurchaseReceiptAction(
  receiptId: string,
  projectId: string,
  purchaseOrderId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    const receipt = await getPurchaseReceiptById(receiptId, ctx);
    if (receipt.projectId !== projectId || receipt.purchaseOrderId !== purchaseOrderId) {
      return { error: "La recepción no pertenece a este proyecto u orden" };
    }
    await cancelPurchaseReceipt(receiptId, ctx);
    revalidatePath(`/proyectos/${projectId}/recepciones`);
    revalidatePath(`/proyectos/${projectId}/recepciones/${receiptId}`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${purchaseOrderId}`);
    revalidatePath("/pendientes");
    revalidatePath(`/proyectos/${projectId}/pendientes`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
