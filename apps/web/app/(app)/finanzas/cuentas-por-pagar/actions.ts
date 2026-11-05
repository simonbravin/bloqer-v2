"use server";

import {
  createPayment,
  getCompanyPayableById,
  getCompanyPaymentById,
  cancelPayment,
  ServiceError,
} from "@bloqer/services";
import {
  createPaymentSchema,
  type CreatePaymentInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
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

const FIN_AP = "/finanzas/cuentas-por-pagar";

export async function createCompanyPaymentAction(
  data: CreatePaymentInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createPaymentSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await getCompanyPayableById(parsed.data.payableId, ctx);
    const payment = await createPayment(parsed.data, ctx);
    revalidateOperationalFinancePaths(payment.projectId);
    revalidatePath(FIN_AP);
    revalidatePath(`${FIN_AP}/${data.payableId}`);
    revalidatePath("/finanzas/transacciones");
    revalidateTreasuryPaths();
    if (payment.projectId) revalidateProjectCostAndFinancePaths(payment.projectId);
    return { id: payment.id };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanyPaymentAction(
  paymentId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await getCompanyPaymentById(paymentId, ctx);
    const payment = await cancelPayment(paymentId, ctx, undefined, reason);
    revalidateOperationalFinancePaths(payment.projectId);
    revalidatePath(FIN_AP);
    revalidatePath(`/finanzas/pagos-proveedor/${paymentId}`);
    revalidatePath("/finanzas/transacciones");
    revalidateTreasuryPaths();
    if (payment.projectId) revalidateProjectCostAndFinancePaths(payment.projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
