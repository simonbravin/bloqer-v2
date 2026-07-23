"use server";

import { registerTransaction, ServiceError } from "@bloqer/services";
import { registerTransactionSchema, type RegisterTransactionInput } from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

const REVALIDATE_PATHS = [
  "/finanzas",
  "/finanzas/transacciones",
  "/finanzas/facturas-proveedor",
  "/finanzas/cuentas-por-pagar",
  "/finanzas/cuentas-por-cobrar",
  "/finanzas/gastos-generales",
  "/tesoreria",
  "/tesoreria/movimientos",
  "/tesoreria/flujo-caja",
];

export async function registerTransactionAction(
  data: RegisterTransactionInput,
): Promise<
  | { ok: true; href: string; traceChain: Awaited<ReturnType<typeof registerTransaction>>["traceChain"]; primaryEntityId: string }
  | { error: string }
> {
  const ctx = await getCtx();
  const parsed = registerTransactionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  try {
    const result = await registerTransaction(parsed.data, ctx);
    for (const path of REVALIDATE_PATHS) revalidatePath(path);
    return {
      ok: true,
      href: result.href,
      traceChain: result.traceChain,
      primaryEntityId: result.primaryEntityId,
    };
  } catch (err) {
    return handle(err);
  }
}