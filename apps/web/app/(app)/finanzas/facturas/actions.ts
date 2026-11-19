"use server";

import {
  getCompanySalesInvoiceById,
  listCompanySalesInvoices,
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
import { revalidateOperationalFinancePaths } from "@/lib/revalidate-project-paths";

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

function revalidateCompanyArPaths(invoiceId?: string, referencedInvoiceId?: string | null) {
  revalidateOperationalFinancePaths();
  revalidatePath(FIN_LIST);
  for (const id of [invoiceId, referencedInvoiceId]) {
    if (!id) continue;
    revalidatePath(`${FIN_LIST}/${id}`);
    revalidatePath(`${FIN_LIST}/${id}/editar`);
  }
  revalidatePath(CXC_LIST);
  revalidatePath("/finanzas/transacciones");
  revalidatePath("/pendientes");
}

/** Parent candidates are always issued corporate invoices, never project documents or other notes. */
export async function listCompanySalesNoteParentsAction(search: string, page = 1) {
  const ctx = await getCtx();
  try {
    const result = await listCompanySalesInvoices(ctx, {
      page,
      pageSize: 10,
      search,
      documentKind: "INVOICE",
      status: "ISSUED",
    });
    return {
      data: result.data.map((invoice) => ({
        id: invoice.id,
        code: invoice.code,
        contactName: invoice.clientName,
        currency: invoice.currency,
        balanceDue: invoice.receivable?.balanceDue ?? "0.00",
      })),
      total: result.total,
    };
  } catch (err) {
    return handle(err);
  }
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
    const invoice = await updateSalesInvoice(invoiceId, parsed.data, ctx, null);
    revalidateCompanyArPaths(invoice.id, invoice.referencedSalesInvoiceId);
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
    const invoice = await issueSalesInvoice(invoiceId, ctx, null);
    revalidateCompanyArPaths(invoice.id, invoice.referencedSalesInvoiceId);
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
    revalidateCompanyArPaths(note.id, parentInvoiceId);
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
    revalidateCompanyArPaths(note.id, parentInvoiceId);
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
    const note = await issueSalesCreditNote(invoiceId, ctx, null);
    revalidateCompanyArPaths(note.id, note.referencedSalesInvoiceId);
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
    const note = await issueSalesDebitNote(invoiceId, ctx, null);
    revalidateCompanyArPaths(note.id, note.referencedSalesInvoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySalesCreditNoteAction(
  invoiceId: string,
  reason?: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    const note = await cancelSalesCreditNote(invoiceId, ctx, null, reason);
    revalidateCompanyArPaths(note.id, note.referencedSalesInvoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanySalesInvoiceAction(
  invoiceId: string,
  reason?: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await getCompanySalesInvoiceById(invoiceId, ctx);
    const invoice = await cancelSalesInvoice(invoiceId, ctx, null, reason);
    revalidateCompanyArPaths(invoice.id, invoice.referencedSalesInvoiceId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
