"use server";

import {
  assertCompanyReceivableMutable,
  createCollection,
  getCollectionById,
  cancelCollection,
  cancelReceivable,
  ServiceError,
} from "@bloqer/services";
import { createCollectionSchema, type CreateCollectionInput } from "@bloqer/validators";
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
    revalidateOperationalFinancePaths(collection.projectId);
    revalidatePath(FIN_AR);
    revalidatePath(`${FIN_AR}/${data.receivableId}`);
    revalidatePath("/finanzas/transacciones");
    revalidateTreasuryPaths();
    if (collection.projectId) revalidateProjectCostAndFinancePaths(collection.projectId);
    return { id: collection.id };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanyReceivableAction(
  receivableId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await assertCompanyReceivableMutable(receivableId, ctx);
    const receivable = await cancelReceivable(receivableId, ctx, undefined, reason);
    revalidateOperationalFinancePaths(receivable.projectId);
    revalidatePath(FIN_AR);
    revalidatePath(`${FIN_AR}/${receivableId}`);
    revalidatePath("/finanzas/transacciones");
    revalidateTreasuryPaths();
    if (receivable.projectId) revalidateProjectCostAndFinancePaths(receivable.projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCompanyCollectionAction(
  receivableId: string,
  collectionId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await assertCompanyReceivableMutable(receivableId, ctx);
    const collection = await getCollectionById(collectionId, ctx);
    if (collection.receivableId !== receivableId || collection.projectId !== null) {
      return { error: "La cobranza no pertenece a esta cuenta por cobrar de empresa" };
    }
    await cancelCollection(collectionId, ctx, undefined, reason);
    revalidateOperationalFinancePaths();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
