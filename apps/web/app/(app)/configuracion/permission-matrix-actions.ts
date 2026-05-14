"use server";

import { revalidatePath } from "next/cache";
import { ServiceError, updateTenantPermissionMatrixNotes } from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

export async function updateTenantPermissionMatrixNotesAction(
  raw: unknown,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "No autenticado" };
  try {
    await updateTenantPermissionMatrixNotes(raw, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      return { error: e.message };
    }
    return { error: "Error al guardar la nota" };
  }
  revalidatePath("/configuracion/permisos");
  return { ok: true };
}
