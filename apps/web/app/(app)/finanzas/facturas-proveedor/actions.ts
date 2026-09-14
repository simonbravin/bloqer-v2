"use server";

import {
  createSupplierInvoice,
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
import {
  createSupplierInvoiceSchema,
  updateSupplierInvoiceSchema,
  type CreateSupplierInvoiceInput,
  type UpdateSupplierInvoiceInput,
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

const FIN_LIST = "/finanzas/facturas-proveedor";

function revalidateCompanyApPaths(invoiceId?: string, extra?: string[]) {
  revalidatePath(FIN_LIST);
  if (invoiceId) revalidatePath(`${FIN_LIST}/${invoiceId}`);
  revalidatePath("/finanzas/cuentas-por-pagar");
  revalidatePath("/finanzas/transacciones");
  for (const p of extra ?? []) revalidatePath(p);
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
    revalidatePath(FIN_LIST);
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
    const inv = await updateSupplierInvoice(invoiceId, parsed.data, ctx);
    revalidatePath(FIN_LIST);
    revalidatePath(`${FIN_LIST}/${invoiceId}`);
    revalidatePath("/finanzas/transacciones");
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
    await issueSupplierInvoice(invoiceId, ctx);
    revalidateCompanyApPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySupplierInvoiceAction(
  invoiceId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelSupplierInvoice(invoiceId, ctx);
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
    revalidateCompanyApPaths(undefined, [`${FIN_LIST}/${note.id}`]);
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
    const note = await createSupplierDebitNoteFromInvoice(
      { parentSupplierInvoiceId: parentInvoiceId },
      ctx,
    );
    revalidateCompanyApPaths(undefined, [`${FIN_LIST}/${note.id}`]);
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
    await issueSupplierCreditNote(invoiceId, ctx);
    revalidateCompanyApPaths(invoiceId);
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
    await issueSupplierDebitNote(invoiceId, ctx);
    revalidateCompanyApPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySupplierCreditNoteAction(
  invoiceId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelSupplierCreditNote(invoiceId, ctx);
    revalidateCompanyApPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
