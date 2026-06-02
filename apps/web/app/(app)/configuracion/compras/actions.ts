"use server";

import {
  upsertCompanyProcurementSettings,
  ServiceError,
} from "@bloqer/services";
import {
  upsertCompanyProcurementSettingsSchema,
  type UpsertCompanyProcurementSettingsInput,
} from "@bloqer/validators";
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

export async function updateCompanyProcurementSettingsAction(
  companyId: string,
  data: UpsertCompanyProcurementSettingsInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = upsertCompanyProcurementSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  try {
    await upsertCompanyProcurementSettings(companyId, parsed.data, ctx);
    revalidatePath("/configuracion/compras");
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}
