"use server";

import {
  createSalesInvoice, createInvoiceFromCertification,
  updateSalesInvoice, issueSalesInvoice, cancelSalesInvoice,
  cancelReceivable,
  ServiceError,
} from "@bloqer/services";
import {
  createSalesInvoiceSchema, createInvoiceFromCertificationSchema,
  updateSalesInvoiceSchema,
  type CreateSalesInvoiceInput, type CreateInvoiceFromCertificationInput,
  type UpdateSalesInvoiceInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type Ok  = { ok: true };
type Err = { error: string };

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

function handle(err: unknown): Err {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

export async function createSalesInvoiceAction(
  projectId: string,
  data: CreateSalesInvoiceInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createSalesInvoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const inv = await createSalesInvoice(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/facturas`);
    return { id: inv.id };
  } catch (err) { return handle(err); }
}

export async function createInvoiceFromCertificationAction(
  projectId: string,
  data: CreateInvoiceFromCertificationInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createInvoiceFromCertificationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const inv = await createInvoiceFromCertification(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/facturas`);
    return { id: inv.id };
  } catch (err) { return handle(err); }
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
    await updateSalesInvoice(invoiceId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/facturas`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function issueSalesInvoiceAction(
  invoiceId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await issueSalesInvoice(invoiceId, ctx);
    revalidatePath(`/proyectos/${projectId}/facturas`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function cancelSalesInvoiceAction(
  invoiceId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await cancelSalesInvoice(invoiceId, ctx);
    revalidatePath(`/proyectos/${projectId}/facturas`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function cancelReceivableAction(
  receivableId: string,
  projectId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await cancelReceivable(receivableId, ctx);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    return { ok: true };
  } catch (err) { return handle(err); }
}
