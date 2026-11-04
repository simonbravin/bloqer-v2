"use server";

import {
  createPurchaseRequest,
  updatePurchaseRequest,
  submitPurchaseRequest,
  returnPurchaseRequest,
  cancelPurchaseRequest,
  getPurchaseRequestById,
  listProcurementQuotesForRequest,
  createProcurementQuote,
  updateProcurementQuote,
  deleteProcurementQuote,
  selectProcurementQuoteAndCreatePo,
  createPurchaseOrdersFromAwards,
  ServiceError,
} from "@bloqer/services";
import {
  createPurchaseRequestSchema,
  updatePurchaseRequestSchema,
  returnPurchaseRequestSchema,
  createProcurementQuoteSchema,
  updateProcurementQuoteSchema,
  createPurchaseOrdersFromAwardsSchema,
  type CreatePurchaseRequestInput,
  type UpdatePurchaseRequestInput,
  type CreateProcurementQuoteInput,
  type UpdateProcurementQuoteInput,
  type CreatePurchaseOrdersFromAwardsInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { revalidateProcurementPaths } from "@/features/procurement/lib/revalidate-procurement-paths";
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
  revalidateProcurementPaths(projectId);
  revalidatePath(`/proyectos/${projectId}/solicitudes-compra`);
  if (prId) {
    revalidatePath(`/proyectos/${projectId}/solicitudes-compra/${prId}`);
    revalidatePath(`/proyectos/${projectId}/solicitudes-compra/${prId}/editar`);
  }
}

async function assertRequestProject(prId: string, projectId: string, ctx: Awaited<ReturnType<typeof getCtx>>) {
  const request = await getPurchaseRequestById(prId, ctx);
  if (request.projectId !== projectId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
}

export async function createPurchaseRequestAction(
  projectId: string,
  data: CreatePurchaseRequestInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPurchaseRequestSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  if (parsed.data.projectId !== projectId) return { error: "La solicitud no pertenece a este proyecto" };
  try {
    const pr = await createPurchaseRequest(parsed.data, ctx);
    revalidatePr(projectId);
    return { id: pr.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updatePurchaseRequestAction(
  prId: string,
  projectId: string,
  data: UpdatePurchaseRequestInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updatePurchaseRequestSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const existing = await getPurchaseRequestById(prId, ctx);
    if (existing.projectId !== projectId) return { error: "Solicitud no encontrada" };
    const pr = await updatePurchaseRequest(prId, parsed.data, ctx);
    revalidatePr(projectId, prId);
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
    await assertRequestProject(prId, projectId, ctx);
    await submitPurchaseRequest(prId, ctx);
    revalidatePr(projectId, prId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function returnPurchaseRequestAction(
  prId: string,
  projectId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = returnPurchaseRequestSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const existing = await getPurchaseRequestById(prId, ctx);
    if (existing.projectId !== projectId) return { error: "Solicitud no encontrada" };
    await returnPurchaseRequest(prId, parsed.data.reason, ctx);
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
    await assertRequestProject(prId, projectId, ctx);
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
    await assertRequestProject(parsed.data.purchaseRequestId, projectId, ctx);
    const quote = await createProcurementQuote(parsed.data, ctx);
    revalidatePr(projectId, parsed.data.purchaseRequestId);
    return { id: quote.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateProcurementQuoteAction(
  projectId: string,
  quoteId: string,
  purchaseRequestId: string,
  data: UpdateProcurementQuoteInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateProcurementQuoteSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await assertRequestProject(purchaseRequestId, projectId, ctx);
    const quote = await updateProcurementQuote(quoteId, purchaseRequestId, parsed.data, ctx);
    revalidatePr(projectId, purchaseRequestId);
    return { id: quote.id };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteProcurementQuoteAction(
  quoteId: string,
  projectId: string,
  purchaseRequestId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await assertRequestProject(purchaseRequestId, projectId, ctx);
    await deleteProcurementQuote(quoteId, purchaseRequestId, ctx);
    revalidatePr(projectId, purchaseRequestId);
    return { ok: true };
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
    await assertRequestProject(purchaseRequestId, projectId, ctx);
    const quotes = await listProcurementQuotesForRequest(purchaseRequestId, ctx);
    if (!quotes.some((quote) => quote.id === quoteId)) return { error: "Cotización no encontrada" };
    const result = await selectProcurementQuoteAndCreatePo(quoteId, ctx);
    revalidatePr(projectId, purchaseRequestId);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra`);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra/${result.purchaseOrderId}`);
    return { purchaseOrderId: result.purchaseOrderId };
  } catch (err) {
    return handle(err);
  }
}

export async function createPurchaseOrdersFromAwardsAction(
  projectId: string,
  data: CreatePurchaseOrdersFromAwardsInput,
): Promise<{ purchaseOrderIds: string[] } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPurchaseOrdersFromAwardsSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await assertRequestProject(parsed.data.purchaseRequestId, projectId, ctx);
    const result = await createPurchaseOrdersFromAwards(
      parsed.data.purchaseRequestId,
      parsed.data.groups,
      ctx,
    );
    revalidatePr(projectId, parsed.data.purchaseRequestId);
    revalidatePath(`/proyectos/${projectId}/ordenes-compra`);
    for (const poId of result.purchaseOrderIds) {
      revalidatePath(`/proyectos/${projectId}/ordenes-compra/${poId}`);
    }
    return { purchaseOrderIds: result.purchaseOrderIds };
  } catch (err) {
    return handle(err);
  }
}
