"use server";

import {
  getCompanySalesInvoiceById,
  updateSalesInvoice,
  cancelSalesInvoice,
  issueSalesInvoice,
  createSalesCreditNoteFromInvoice,
  createSalesDebitNoteFromInvoice,
  issueSalesCreditNote,
  issueSalesDebitNote,
  cancelSalesCreditNote,
  ServiceError,
} from "@bloqer/services";
import {
  updateSalesInvoiceSchema,
  type UpdateSalesInvoiceInput,
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

const FIN_LIST = "/finanzas/facturas";
const CXC_LIST = "/finanzas/cuentas-por-cobrar";

function revalidateCompanyArPaths(invoiceId?: string, extra?: string[]) {
  revalidatePath(FIN_LIST);
  if (invoiceId) revalidatePath(`${FIN_LIST}/${invoiceId}`);
  revalidatePath(CXC_LIST);
  revalidatePath("/finanzas/transacciones");
  for (const p of extra ?? []) revalidatePath(p);
}

export async function updateCompanySalesInvoiceAction(
  invoiceId: string,
  data: UpdateSalesInvoiceInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateSalesInvoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    await updateSalesInvoice(invoiceId, parsed.data, ctx);
    revalidateCompanyArPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function issueCompanySalesInvoiceAction(
  invoiceId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    await issueSalesInvoice(invoiceId, ctx);
    revalidateCompanyArPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createCompanySalesCreditNoteFromInvoiceAction(
  parentInvoiceId: string,
  options?: { amount?: string },
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(parentInvoiceId, ctx);
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
    revalidateCompanyArPaths(undefined, [`${FIN_LIST}/${note.id}`]);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function createCompanySalesDebitNoteFromInvoiceAction(
  parentInvoiceId: string,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(parentInvoiceId, ctx);
    const note = await createSalesDebitNoteFromInvoice(
      { parentSalesInvoiceId: parentInvoiceId },
      ctx,
    );
    revalidateCompanyArPaths(undefined, [`${FIN_LIST}/${note.id}`]);
    return { id: note.id };
  } catch (err) {
    return handle(err);
  }
}

export async function issueCompanySalesCreditNoteAction(
  invoiceId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    await issueSalesCreditNote(invoiceId, ctx);
    revalidateCompanyArPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function issueCompanySalesDebitNoteAction(
  invoiceId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    await issueSalesDebitNote(invoiceId, ctx);
    revalidateCompanyArPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySalesCreditNoteAction(
  invoiceId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    await cancelSalesCreditNote(invoiceId, ctx);
    revalidateCompanyArPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySalesInvoiceAction(
  invoiceId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    await cancelSalesInvoice(invoiceId, ctx);
    revalidateCompanyArPaths(invoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
