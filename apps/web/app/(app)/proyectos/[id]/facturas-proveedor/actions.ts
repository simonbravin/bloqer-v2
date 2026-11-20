"use server";

import {
  createSupplierInvoice,
  createSupplierInvoiceDraftFromPurchaseOrder,
  getPurchaseOrderInvoiceDraftPreview,
  updateSupplierInvoice,
  issueSupplierInvoice,
  cancelSupplierInvoice,
  createSupplierCreditNoteFromInvoice,
  createSupplierDebitNoteFromInvoice,
  issueSupplierCreditNote,
  issueSupplierDebitNote,
  cancelSupplierCreditNote,
  getSupplierInvoiceById,
  listSupplierInvoicesByProject,
  registerApExpense,
  ServiceError,
  type PurchaseOrderInvoiceDraftPreview,
} from "@bloqer/services";
import { can } from "@bloqer/domain";
import {
  createSupplierInvoiceSchema,
  createSupplierInvoiceFromPurchaseOrderSchema,
  updateSupplierInvoiceSchema,
  registerApExpenseSchema,
  type CreateSupplierInvoiceInput,
  type RegisterApExpenseInput,
  type UpdateSupplierInvoiceInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import {
  resolveSupplierInvoiceDraftCreation,
  type SupplierInvoiceDraftCreationResult,
} from "@/features/ap/lib/supplier-invoice-draft-creation";
import {
  revalidateProjectCostAndFinancePaths,
  revalidateOperationalFinancePaths,
  revalidateTreasuryPaths,
} from "@/lib/revalidate-project-paths";
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

function revalidateProjectApPaths(projectId: string, extra?: string[]) {
  revalidateOperationalFinancePaths(projectId);
  revalidatePath(`/proyectos/${projectId}/facturas-proveedor`);
  revalidatePath(`/proyectos/${projectId}/cuentas-por-pagar`);
  revalidatePath(`/proyectos/${projectId}/ordenes-compra`);
  revalidatePath(`/proyectos/${projectId}/recepciones`);
  revalidateProjectCostAndFinancePaths(projectId);
  revalidateTreasuryPaths();
  for (const p of extra ?? []) revalidatePath(p);
}

export async function listProjectSupplierNoteParentsAction(projectId: string, search: string, page = 1) {
  const ctx = await getCtx();
  if (!can(ctx.roles, "EDIT", "AP")) return { error: "Sin permisos para crear notas de crédito/débito" };
  try {
    const result = await listSupplierInvoicesByProject(projectId, ctx, {
      status: "ISSUED",
      documentKind: "INVOICE",
      search: typeof search === "string" ? search.trim() : "",
      page: Number.isSafeInteger(page) && page > 0 ? page : 1,
      pageSize: 10,
    });
    return {
      data: result.data.map((invoice) => ({
        id: invoice.id,
        code: invoice.code,
        contactName: invoice.supplierName,
        currency: invoice.currency,
        balanceDue: invoice.payable?.balanceDue ?? "0.00",
      })),
      total: result.total,
    };
  } catch (err) {
    return handle(err);
  }
}

export async function createSupplierInvoiceFromPurchaseOrderAction(
  projectId: string,
  data: {
    purchaseOrderId: string;
    purchaseReceiptId?: string | null;
    basis?: "received" | "remaining";
  },
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createSupplierInvoiceFromPurchaseOrderSchema.safeParse({
    projectId,
    purchaseOrderId: data.purchaseOrderId,
    purchaseReceiptId: data.purchaseReceiptId ?? null,
    basis: data.basis ?? "received",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const inv = await createSupplierInvoiceDraftFromPurchaseOrder(parsed.data, ctx);
    revalidateProjectApPaths(projectId, [
      `/proyectos/${projectId}/ordenes-compra/${data.purchaseOrderId}`,
      `/proyectos/${projectId}/facturas-proveedor/${inv.id}`,
    ]);
    return { id: inv.id };
  } catch (err) {
    return handle(err);
  }
}

export async function getPurchaseOrderInvoiceDraftPreviewAction(
  projectId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderInvoiceDraftPreview | { error: string }> {
  const ctx = await getCtx();
  try {
    return await getPurchaseOrderInvoiceDraftPreview(purchaseOrderId, projectId, ctx);
  } catch (err) {
    return handle(err);
  }
}

export async function registerProjectApExpenseAction(
  projectId: string,
  data: Omit<RegisterApExpenseInput, "projectId" | "internalNotes" | "currency"> & {
    currency?: string;
    lines: CreateSupplierInvoiceInput["lines"];
  },
): Promise<{ id: string; paymentId?: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = registerApExpenseSchema.safeParse({
    ...data,
    projectId,
    currency: data.currency ?? "ARS",
    internalNotes: null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const result = await registerApExpense(parsed.data, ctx);
    const invoiceId =
      result.primaryEntityType === "SupplierInvoice"
        ? result.primaryEntityId
        : result.traceChain.find((l) => l.entityType === "SupplierInvoice")?.entityId;
    if (!invoiceId) {
      return { error: "No se pudo resolver la factura creada" };
    }
    revalidateProjectApPaths(projectId, [
      `/proyectos/${projectId}/facturas-proveedor/${invoiceId}`,
      `/proyectos/${projectId}/pagos`,
    ]);
    return {
      id: invoiceId,
      paymentId: result.primaryEntityType === "Payment" ? result.primaryEntityId : undefined,
    };
  } catch (err) {
    return handle(err);
  }
}

export async function createSupplierInvoiceAction(
  projectId: string,
  data: Omit<CreateSupplierInvoiceInput, "projectId"> & { projectId?: string | null },
): Promise<SupplierInvoiceDraftCreationResult> {
  const ctx = await getCtx();
  const payload: CreateSupplierInvoiceInput = { ...data, projectId };
  const parsed = createSupplierInvoiceSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  return resolveSupplierInvoiceDraftCreation({
    create: () => createSupplierInvoice(parsed.data, ctx),
    revalidate: () => revalidateProjectApPaths(projectId),
    // This service raises business rejections before commit or within its transaction.
    rejectionMessage: (error) => error instanceof ServiceError ? error.message : null,
  });
}

export async function updateSupplierInvoiceAction(
  invoiceId: string,
  projectId: string,
  data: UpdateSupplierInvoiceInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateSupplierInvoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const inv = await updateSupplierInvoice(invoiceId, parsed.data, ctx, projectId);
    revalidateProjectApPaths(projectId, [`/proyectos/${projectId}/facturas-proveedor/${invoiceId}`]);
    return { id: inv.id };
  } catch (err) {
    return handle(err);
  }
}

export async function issueSupplierInvoiceAction(
  invoiceId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await issueSupplierInvoice(invoiceId, ctx, projectId);
    revalidateProjectApPaths(projectId, [`/proyectos/${projectId}/facturas-proveedor/${invoiceId}`]);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelSupplierInvoiceAction(
  invoiceId: string,
  projectId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelSupplierInvoice(invoiceId, ctx, projectId, reason);
    revalidateProjectApPaths(projectId, [`/proyectos/${projectId}/facturas-proveedor/${invoiceId}`]);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createSupplierCreditNoteFromInvoiceAction(
  parentInvoiceId: string,
  projectId: string,
  options?: { amount?: string },
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getSupplierInvoiceById(parentInvoiceId, ctx, projectId);
    const note = await createSupplierCreditNoteFromInvoice(
      {
        parentSupplierInvoiceId: parentInvoiceId,
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
    revalidateProjectApPaths(projectId, [
      `/proyectos/${projectId}/facturas-proveedor/${parentInvoiceId}`,
      `/proyectos/${projectId}/facturas-proveedor/${note.id}`,
    ]);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function createSupplierDebitNoteFromInvoiceAction(
  parentInvoiceId: string,
  projectId: string,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getSupplierInvoiceById(parentInvoiceId, ctx, projectId);
    const note = await createSupplierDebitNoteFromInvoice(
      { parentSupplierInvoiceId: parentInvoiceId },
      ctx,
    );
    revalidateProjectApPaths(projectId, [
      `/proyectos/${projectId}/facturas-proveedor/${parentInvoiceId}`,
      `/proyectos/${projectId}/facturas-proveedor/${note.id}`,
    ]);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function issueSupplierCreditNoteAction(
  invoiceId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    const note = await issueSupplierCreditNote(invoiceId, ctx, projectId);
    revalidateProjectApPaths(projectId, [
      `/proyectos/${projectId}/facturas-proveedor/${invoiceId}`,
      ...(note.referencedSupplierInvoiceId ? [`/proyectos/${projectId}/facturas-proveedor/${note.referencedSupplierInvoiceId}`] : []),
    ]);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function issueSupplierDebitNoteAction(
  invoiceId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    const note = await issueSupplierDebitNote(invoiceId, ctx, projectId);
    revalidateProjectApPaths(projectId, [
      `/proyectos/${projectId}/facturas-proveedor/${invoiceId}`,
      ...(note.referencedSupplierInvoiceId ? [`/proyectos/${projectId}/facturas-proveedor/${note.referencedSupplierInvoiceId}`] : []),
    ]);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelSupplierCreditNoteAction(
  invoiceId: string,
  projectId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    const note = await cancelSupplierCreditNote(invoiceId, ctx, projectId, reason);
    revalidateProjectApPaths(projectId, [
      `/proyectos/${projectId}/facturas-proveedor/${invoiceId}`,
      ...(note.referencedSupplierInvoiceId ? [`/proyectos/${projectId}/facturas-proveedor/${note.referencedSupplierInvoiceId}`] : []),
    ]);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
