"use server";

import {
  createSupplierInvoice,
  createSupplierInvoiceDraftFromPurchaseOrder,
  updateSupplierInvoice,
  issueSupplierInvoice,
  cancelSupplierInvoice,
  ServiceError,
} from "@bloqer/services";
import {
  createSupplierInvoiceSchema,
  createSupplierInvoiceFromPurchaseOrderSchema,
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

function revalidateProjectApPaths(projectId: string, extra?: string[]) {
  revalidatePath(`/proyectos/${projectId}/facturas-proveedor`);
  revalidatePath(`/proyectos/${projectId}/cuentas-por-pagar`);
  revalidatePath(`/proyectos/${projectId}/ordenes-compra`);
  revalidatePath(`/proyectos/${projectId}/recepciones`);
  for (const p of extra ?? []) revalidatePath(p);
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
    revalidateProjectApPaths(projectId);
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
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelSupplierInvoice(invoiceId, ctx, projectId);
    revalidateProjectApPaths(projectId, [`/proyectos/${projectId}/facturas-proveedor/${invoiceId}`]);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
