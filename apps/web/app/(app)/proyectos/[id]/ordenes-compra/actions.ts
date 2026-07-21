"use server";

import {
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  returnPurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseReceipt,
  confirmPurchaseReceipt,
  cancelPurchaseReceipt,
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
}

export async function createPurchaseOrderAction(
  projectId: string,
  data: CreatePurchaseOrderInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPurchaseOrderSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
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
  try {
    await confirmPurchaseOrder(poId, ctx);
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
  try {
    const receipt = await createPurchaseReceipt(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/recepciones`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${data.purchaseOrderId}`);
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
    await confirmPurchaseReceipt(receiptId, ctx);
    revalidatePath(`/proyectos/${projectId}/recepciones`);
    revalidatePath(`/proyectos/${projectId}/recepciones/${receiptId}`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${purchaseOrderId}`);
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
    await cancelPurchaseReceipt(receiptId, ctx);
    revalidatePath(`/proyectos/${projectId}/recepciones`);
    revalidatePath(`/proyectos/${projectId}/recepciones/${receiptId}`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${purchaseOrderId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
