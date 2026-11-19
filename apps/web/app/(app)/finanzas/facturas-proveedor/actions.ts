"use server";

import {
  createSupplierInvoice,
  listCompanySupplierInvoices,
  getCompanySupplierInvoiceById,
  issueSupplierInvoice,
  cancelSupplierInvoice,
  updateSupplierInvoice,
  createSupplierCreditNoteFromInvoice,
  createSupplierDebitNoteFromInvoice,
  issueSupplierCreditNote,
  issueSupplierDebitNote,
  cancelSupplierCreditNote,
  ServiceError,
} from "@bloqer/services";
import { can } from "@bloqer/domain";
import {
  createSupplierInvoiceSchema,
  updateSupplierInvoiceSchema,
  type CreateSupplierInvoiceInput,
  type UpdateSupplierInvoiceInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { revalidateOperationalFinancePaths } from "@/lib/revalidate-project-paths";

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

const FIN_LIST = "/finanzas/facturas-proveedor";

function revalidateCompanyApPaths(invoiceId?: string, extra?: string[]) {
  revalidateOperationalFinancePaths();
  revalidatePath(FIN_LIST);
  if (invoiceId) revalidatePath(`${FIN_LIST}/${invoiceId}`);
  revalidatePath("/finanzas/cuentas-por-pagar");
  revalidatePath("/finanzas/transacciones");
  for (const p of extra ?? []) revalidatePath(p);
}

export async function listCompanySupplierNoteParentsAction(search: string, page = 1) {
  const ctx = await getCtx();
  if (!can(ctx.roles, "EDIT", "AP")) return { error: "Sin permisos para crear notas de crédito/débito" };
  try {
    const result = await listCompanySupplierInvoices(ctx, {
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

export async function createCompanySupplierInvoiceAction(
  data: Omit<CreateSupplierInvoiceInput, "projectId">,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const payload: CreateSupplierInvoiceInput = { ...data, projectId: null, purchaseOrderId: null };
  const parsed = createSupplierInvoiceSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const inv = await createSupplierInvoice(parsed.data, ctx);
    revalidateCompanyApPaths(inv.id);
    return { id: inv.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateCompanySupplierInvoiceAction(
  invoiceId: string,
  data: UpdateSupplierInvoiceInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateSupplierInvoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await getCompanySupplierInvoiceById(invoiceId, ctx);
    const inv = await updateSupplierInvoice(invoiceId, parsed.data, ctx, null);
    revalidateCompanyApPaths(inv.id);
    return { id: inv.id };
  } catch (err) {
    return handle(err);
  }
}

export async function issueCompanySupplierInvoiceAction(
  invoiceId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getCompanySupplierInvoiceById(invoiceId, ctx);
    await issueSupplierInvoice(invoiceId, ctx, null);
    revalidateCompanyApPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySupplierInvoiceAction(
  invoiceId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getCompanySupplierInvoiceById(invoiceId, ctx);
    await cancelSupplierInvoice(invoiceId, ctx, null, reason);
    revalidateCompanyApPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createCompanySupplierCreditNoteFromInvoiceAction(
  parentInvoiceId: string,
  options?: { amount?: string },
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getCompanySupplierInvoiceById(parentInvoiceId, ctx);
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
    revalidateCompanyApPaths(parentInvoiceId, [`${FIN_LIST}/${note.id}`]);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function createCompanySupplierDebitNoteFromInvoiceAction(
  parentInvoiceId: string,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getCompanySupplierInvoiceById(parentInvoiceId, ctx);
    const note = await createSupplierDebitNoteFromInvoice(
      { parentSupplierInvoiceId: parentInvoiceId },
      ctx,
    );
    revalidateCompanyApPaths(parentInvoiceId, [`${FIN_LIST}/${note.id}`]);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function issueCompanySupplierCreditNoteAction(
  invoiceId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    const note = await getCompanySupplierInvoiceById(invoiceId, ctx);
    await issueSupplierCreditNote(invoiceId, ctx, null);
    revalidateCompanyApPaths(invoiceId, note.referencedSupplierInvoiceId
      ? [`${FIN_LIST}/${note.referencedSupplierInvoiceId}`]
      : undefined);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function issueCompanySupplierDebitNoteAction(
  invoiceId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getCompanySupplierInvoiceById(invoiceId, ctx);
    await issueSupplierDebitNote(invoiceId, ctx, null);
    revalidateCompanyApPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySupplierCreditNoteAction(
  invoiceId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    const note = await getCompanySupplierInvoiceById(invoiceId, ctx);
    await cancelSupplierCreditNote(invoiceId, ctx, null, reason);
    revalidateCompanyApPaths(invoiceId, note.referencedSupplierInvoiceId
      ? [`${FIN_LIST}/${note.referencedSupplierInvoiceId}`]
      : undefined);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
