"use server";

import {
  createSupplierInvoice,
  issueSupplierInvoice,
  cancelSupplierInvoice,
  ServiceError,
} from "@bloqer/services";
import {
  createSupplierInvoiceSchema,
  type CreateSupplierInvoiceInput,
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

export async function issueCompanySupplierInvoiceAction(
  invoiceId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await issueSupplierInvoice(invoiceId, ctx);
    revalidatePath(FIN_LIST);
    revalidatePath(`${FIN_LIST}/${invoiceId}`);
    revalidatePath("/finanzas/cuentas-por-pagar");
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
    revalidatePath(FIN_LIST);
    revalidatePath(`${FIN_LIST}/${invoiceId}`);
    revalidatePath("/finanzas/cuentas-por-pagar");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
