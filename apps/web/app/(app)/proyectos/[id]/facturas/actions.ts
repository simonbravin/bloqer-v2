"use server";

import {
  createSalesInvoice,
  createInvoiceFromCertification,
  updateSalesInvoice,
  issueSalesInvoice,
  cancelSalesInvoice,
  createSalesCreditNoteFromInvoice,
  createSalesDebitNoteFromInvoice,
  issueSalesCreditNote,
  issueSalesDebitNote,
  cancelSalesCreditNote,
  getSalesInvoiceById,
  cancelReceivable,
  registerArAdvance,
  registerArSale,
  ServiceError,
} from "@bloqer/services";
import {
  createSalesInvoiceSchema,
  createInvoiceFromCertificationSchema,
  updateSalesInvoiceSchema,
  registerArAdvanceSchema,
  registerArSaleSchema,
  type CreateSalesInvoiceInput,
  type CreateInvoiceFromCertificationInput,
  type UpdateSalesInvoiceInput,
  type RegisterArAdvanceInput,
  type RegisterArSaleInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import {
  revalidateProjectCostAndFinancePaths,
  revalidateTreasuryPaths,
} from "@/lib/revalidate-project-paths";
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

type InvoiceCacheReference = Pick<
  Awaited<ReturnType<typeof getSalesInvoiceById>>,
  "id" | "projectId" | "certificationId" | "referencedSalesInvoiceId"
>;

/** Resolve a note's certification before committing; invalidation never requires a post-write read. */
async function getInvoiceCertificationReference(
  invoiceId: string,
  projectId: string,
  ctx: Awaited<ReturnType<typeof getCtx>>,
) {
  const invoice = await getSalesInvoiceById(invoiceId, ctx, projectId);
  if (invoice.certificationId || !invoice.referencedSalesInvoiceId) return invoice.certificationId;
  const parent = await getSalesInvoiceById(invoice.referencedSalesInvoiceId, ctx, projectId);
  return parent.certificationId;
}

function revalidateInvoicePaths(
  invoice: InvoiceCacheReference,
  certificationId: string | null = invoice.certificationId,
) {
  const projectId = invoice.projectId;
  if (!projectId) return;
  revalidatePath(`/proyectos/${projectId}/facturas`);
  revalidatePath(`/proyectos/${projectId}/facturas/${invoice.id}`);
  revalidatePath(`/proyectos/${projectId}/facturas/${invoice.id}/editar`);
  if (invoice.referencedSalesInvoiceId) {
    revalidatePath(`/proyectos/${projectId}/facturas/${invoice.referencedSalesInvoiceId}`);
    revalidatePath(`/proyectos/${projectId}/facturas/${invoice.referencedSalesInvoiceId}/editar`);
  }
  revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
  revalidatePath("/finanzas/cuentas-por-cobrar");
  revalidatePath("/pendientes");
  if (certificationId) {
    revalidatePath(`/proyectos/${projectId}/certificaciones`);
    revalidatePath(`/proyectos/${projectId}/certificaciones/${certificationId}`);
    revalidatePath(`/proyectos/${projectId}/certificaciones/${certificationId}/editar`);
    revalidatePath(`/proyectos/${projectId}/reportes/certificaciones`);
    revalidatePath(`/proyectos/${projectId}/reportes/avances`);
  }
  revalidateProjectCostAndFinancePaths(projectId);
}

export async function createSalesInvoiceAction(
  projectId: string,
  data: CreateSalesInvoiceInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createSalesInvoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  if (parsed.data.projectId !== projectId) {
    return { error: "El proyecto del formulario no coincide con la obra" };
  }
  try {
    const inv = await createSalesInvoice({ ...parsed.data, projectId }, ctx);
    revalidateInvoicePaths(inv);
    return { id: inv.id };
  } catch (err) {
    return handle(err);
  }
}

/** Emit + optional collectNow in one shot ([D-077] / Q-055). */
export async function registerProjectArSaleAction(
  projectId: string,
  data: RegisterArSaleInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = registerArSaleSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  if (parsed.data.projectId !== projectId) {
    return { error: "El proyecto del formulario no coincide con la obra" };
  }
  try {
    const result = await registerArSale({ ...parsed.data, projectId }, ctx);
    const invoiceLink = result.traceChain.find((l) => l.entityType === "SalesInvoice");
    const invoiceId = invoiceLink?.entityId ?? result.primaryEntityId;
    revalidatePath(`/proyectos/${projectId}/facturas`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    revalidatePath(`/proyectos/${projectId}/cobranzas`);
    revalidateProjectCostAndFinancePaths(projectId);
    revalidateTreasuryPaths();
    return { id: invoiceId };
  } catch (err) {
    return handle(err);
  }
}

export async function createInvoiceFromCertificationAction(
  projectId: string,
  data: CreateInvoiceFromCertificationInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createInvoiceFromCertificationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const inv = await createInvoiceFromCertification(parsed.data, ctx, projectId);
    revalidateInvoicePaths(inv);
    return { id: inv.id };
  } catch (err) {
    return handle(err);
  }
}

export async function registerArAdvanceAction(
  projectId: string,
  data: RegisterArAdvanceInput,
): Promise<{ invoiceId: string } | Err> {
  const ctx = await getCtx();
  const parsed = registerArAdvanceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  if (parsed.data.projectId !== projectId) {
    return { error: "El proyecto del formulario no coincide con la obra" };
  }
  try {
    const result = await registerArAdvance({ ...parsed.data, projectId }, ctx);
    const invoiceLink = result.traceChain.find((l) => l.entityType === "SalesInvoice");
    const invoiceId = invoiceLink?.entityId ?? result.primaryEntityId;
    revalidatePath(`/proyectos/${projectId}/facturas`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    revalidatePath(`/proyectos/${projectId}/cobranzas`);
    revalidateProjectCostAndFinancePaths(projectId);
    revalidateTreasuryPaths();
    return { invoiceId };
  } catch (err) {
    return handle(err);
  }
}

export async function updateSalesInvoiceAction(
  invoiceId: string,
  projectId: string,
  data: UpdateSalesInvoiceInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateSalesInvoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const certificationId = await getInvoiceCertificationReference(invoiceId, projectId, ctx);
    const invoice = await updateSalesInvoice(invoiceId, parsed.data, ctx, projectId);
    revalidateInvoicePaths(invoice, invoice.certificationId ?? certificationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function issueSalesInvoiceAction(
  invoiceId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    const certificationId = await getInvoiceCertificationReference(invoiceId, projectId, ctx);
    const invoice = await issueSalesInvoice(invoiceId, ctx, projectId);
    revalidateInvoicePaths(invoice, invoice.certificationId ?? certificationId);
    revalidateTreasuryPaths();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelSalesInvoiceAction(
  invoiceId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    const certificationId = await getInvoiceCertificationReference(invoiceId, projectId, ctx);
    const invoice = await cancelSalesInvoice(invoiceId, ctx, projectId);
    revalidateInvoicePaths(invoice, invoice.certificationId ?? certificationId);
    revalidateTreasuryPaths();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createSalesCreditNoteFromInvoiceAction(
  parentInvoiceId: string,
  projectId: string,
  options?: { amount?: string },
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  try {
    const parent = await getSalesInvoiceById(parentInvoiceId, ctx, projectId);
    const note = await createSalesCreditNoteFromInvoice(
      {
        parentSalesInvoiceId: parentInvoiceId,
        ...(options?.amount
          ? {
              lines: [
                {
                  description: "Nota de crédito",
                  quantity: "1",
                  unitPrice: options.amount,
                  taxRate: "0",
                  discountPct: "0",
                },
              ],
            }
          : {}),
      },
      ctx,
    );
    revalidateInvoicePaths(note, parent.certificationId);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function createSalesDebitNoteFromInvoiceAction(
  parentInvoiceId: string,
  projectId: string,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  try {
    const parent = await getSalesInvoiceById(parentInvoiceId, ctx, projectId);
    const note = await createSalesDebitNoteFromInvoice(
      { parentSalesInvoiceId: parentInvoiceId },
      ctx,
    );
    revalidateInvoicePaths(note, parent.certificationId);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function issueSalesCreditNoteAction(
  invoiceId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    const certificationId = await getInvoiceCertificationReference(invoiceId, projectId, ctx);
    const note = await issueSalesCreditNote(invoiceId, ctx, projectId);
    revalidateInvoicePaths(note, certificationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function issueSalesDebitNoteAction(
  invoiceId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    const certificationId = await getInvoiceCertificationReference(invoiceId, projectId, ctx);
    const note = await issueSalesDebitNote(invoiceId, ctx, projectId);
    revalidateInvoicePaths(note, certificationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelSalesCreditNoteAction(
  invoiceId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    const certificationId = await getInvoiceCertificationReference(invoiceId, projectId, ctx);
    const note = await cancelSalesCreditNote(invoiceId, ctx, projectId);
    revalidateInvoicePaths(note, certificationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelReceivableAction(
  receivableId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await cancelReceivable(receivableId, ctx, projectId);
    // The existing receivable getter can reconcile balances while reading. Avoid it for cache
    // discovery: the mutation has already authorized this exact project, including its descendants.
    revalidatePath(`/proyectos/${projectId}`, "layout");
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    revalidateProjectCostAndFinancePaths(projectId);
    revalidateTreasuryPaths();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
