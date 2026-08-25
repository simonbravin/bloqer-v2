"use server";

import {
  ServiceError,
  updateProjectApprovedBudgetEditsPolicy,
  updateTenantApprovedBudgetEditsPolicy,
  upsertCompanyProcurementSettings,
} from "@bloqer/services";
import {
  upsertCompanyProcurementSettingsSchema,
  type UpsertCompanyProcurementSettingsInput,
} from "@bloqer/validators";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  return ctx;
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
    revalidatePath("/configuracion/politicas");
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function updateTenantApprovedBudgetEditsPolicyAction(
  data: { allow: boolean },
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await updateTenantApprovedBudgetEditsPolicy(data, ctx);
    revalidatePath("/configuracion/politicas");
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function updateProjectApprovedBudgetEditsPolicyAction(
  data: { projectId: string; allow: boolean },
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await updateProjectApprovedBudgetEditsPolicy(data, ctx);
    revalidatePath("/configuracion/politicas");
    revalidatePath(`/proyectos/${data.projectId}`);
    revalidatePath(`/proyectos/${data.projectId}/presupuestos`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}
