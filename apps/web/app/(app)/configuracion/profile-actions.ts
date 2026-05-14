"use server";

import { revalidatePath } from "next/cache";
import { ServiceError, updateMyUserProfile } from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

export async function updateMyUserProfileAction(formData: FormData) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" } as const;
  const name = String(formData.get("name") ?? "").trim();
  try {
    await updateMyUserProfile({ name }, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      return { error: e.message } as const;
    }
    return { error: "Error al guardar" } as const;
  }
  revalidatePath("/configuracion/perfil");
  return { ok: true as const };
}
