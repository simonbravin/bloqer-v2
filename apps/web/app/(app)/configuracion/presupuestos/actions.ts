"use server";

import {
  ServiceError,
  updateTenantApprovedBudgetEditsPolicy,
  updateProjectApprovedBudgetEditsPolicy,
} from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function updateTenantApprovedBudgetEditsPolicyAction(
  data: { allow: boolean },
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await updateTenantApprovedBudgetEditsPolicy(data, ctx);
    revalidatePath("/configuracion/presupuestos");
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
    revalidatePath("/configuracion/presupuestos");
    revalidatePath(`/proyectos/${data.projectId}`);
    revalidatePath(`/proyectos/${data.projectId}/presupuestos`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}
