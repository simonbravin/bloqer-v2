"use server";

import {
  createSupplierInvoice,
  updateSupplierInvoice,
  issueSupplierInvoice,
  cancelSupplierInvoice,
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

export async function createSupplierInvoiceAction(
  projectId: string,
  data: Omit<CreateSupplierInvoiceInput, "projectId"> & { projectId?: string | null },
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const payload: CreateSupplierInvoiceInput = { ...data, projectId };
  const parsed = createSupplierInvoiceSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const inv = await createSupplierInvoice(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/facturas-proveedor`);
    return { id: inv.id };
  } catch (err) {
    return handle(err);
  }
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
    revalidatePath(`/proyectos/${projectId}/facturas-proveedor`);
    revalidatePath(`/proyectos/${projectId}/facturas-proveedor/${invoiceId}`);
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
    revalidatePath(`/proyectos/${projectId}/facturas-proveedor`);
    revalidatePath(`/proyectos/${projectId}/facturas-proveedor/${invoiceId}`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-pagar`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelSupplierInvoiceAction(
  invoiceId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelSupplierInvoice(invoiceId, ctx, projectId);
    revalidatePath(`/proyectos/${projectId}/facturas-proveedor`);
    revalidatePath(`/proyectos/${projectId}/facturas-proveedor/${invoiceId}`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-pagar`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
