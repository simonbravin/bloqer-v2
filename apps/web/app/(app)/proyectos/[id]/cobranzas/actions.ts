"use server";

import {
  createCollection,
  cancelCollection,
  ServiceError,
} from "@bloqer/services";
import {
  createCollectionSchema,
  type CreateCollectionInput,
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

export async function createCollectionAction(
  projectId: string,
  data: CreateCollectionInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createCollectionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const collection = await createCollection(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/cobranzas`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    return { id: collection.id };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelCollectionAction(
  collectionId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelCollection(collectionId, ctx);
    revalidatePath(`/proyectos/${projectId}/cobranzas`);
    revalidatePath(`/proyectos/${projectId}/cuentas-por-cobrar`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
