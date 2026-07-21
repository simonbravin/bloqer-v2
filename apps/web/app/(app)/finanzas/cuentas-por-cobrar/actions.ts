"use server";

import {
  assertCompanyReceivableMutable,
  createCollection,
  cancelReceivable,
  ServiceError,
} from "@bloqer/services";
import { createCollectionSchema, type CreateCollectionInput } from "@bloqer/validators";
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

const FIN_AR = "/finanzas/cuentas-por-cobrar";

export async function createCompanyCollectionAction(
  data: CreateCollectionInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createCollectionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await assertCompanyReceivableMutable(parsed.data.receivableId, ctx);
    const collection = await createCollection(parsed.data, ctx);
    revalidatePath(FIN_AR);
    revalidatePath(`${FIN_AR}/${data.receivableId}`);
    revalidatePath("/finanzas/transacciones");
    return { id: collection.id };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanyReceivableAction(
  receivableId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await assertCompanyReceivableMutable(receivableId, ctx);
    await cancelReceivable(receivableId, ctx);
    revalidatePath(FIN_AR);
    revalidatePath(`${FIN_AR}/${receivableId}`);
    revalidatePath("/finanzas/transacciones");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
