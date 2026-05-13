"use server";

import {
  createPayment,
  cancelPayment,
  ServiceError,
} from "@bloqer/services";
import {
  createPaymentSchema,
  type CreatePaymentInput,
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

export async function createPaymentAction(
  projectId: string,
  data: CreatePaymentInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPaymentSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const payment = await createPayment(parsed.data, ctx, projectId);
    revalidatePath(`/proyectos/${projectId}/pagos`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-pagar`);
    return { id: payment.id };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelPaymentAction(
  paymentId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelPayment(paymentId, ctx, projectId);
    revalidatePath(`/proyectos/${projectId}/pagos`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-pagar`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
