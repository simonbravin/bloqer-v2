"use server";

import {
  createPurchaseRequest,
  submitPurchaseRequest,
  cancelPurchaseRequest,
  createProcurementQuote,
  selectProcurementQuoteAndCreatePo,
  ServiceError,
} from "@bloqer/services";
import {
  createPurchaseRequestSchema,
  createProcurementQuoteSchema,
  type CreatePurchaseRequestInput,
  type CreateProcurementQuoteInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

function revalidatePr(projectId: string, prId?: string) {
  revalidatePath(`/proyectos/${projectId}/solicitudes-compra`);
  if (prId) revalidatePath(`/proyectos/${projectId}/solicitudes-compra/${prId}`);
}

export async function createPurchaseRequestAction(
  projectId: string,
  data: CreatePurchaseRequestInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPurchaseRequestSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const pr = await createPurchaseRequest(parsed.data, ctx);
    revalidatePr(projectId);
    return { id: pr.id };
  } catch (err) {
    return handle(err);
  }
}

export async function submitPurchaseRequestAction(
  prId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await submitPurchaseRequest(prId, ctx);
    revalidatePr(projectId, prId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelPurchaseRequestAction(
  prId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelPurchaseRequest(prId, ctx);
    revalidatePr(projectId, prId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createProcurementQuoteAction(
  projectId: string,
  data: CreateProcurementQuoteInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createProcurementQuoteSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const quote = await createProcurementQuote(parsed.data, ctx);
    revalidatePr(projectId, parsed.data.purchaseRequestId);
    return { id: quote.id };
  } catch (err) {
    return handle(err);
  }
}

export async function selectQuoteAndCreatePoAction(
  quoteId: string,
  projectId: string,
  purchaseRequestId: string,
): Promise<{ purchaseOrderId: string } | { error: string }> {
  const ctx = await getCtx();
  try {
    const result = await selectProcurementQuoteAndCreatePo(quoteId, ctx);
    revalidatePr(projectId, purchaseRequestId);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${result.purchaseOrderId}`);
    return { purchaseOrderId: result.purchaseOrderId };
  } catch (err) {
    return handle(err);
  }
}
