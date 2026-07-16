"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createStockConsumption, ServiceError } from "@bloqer/services";
import type { CreateStockConsumptionInput } from "@bloqer/validators";

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) throw new Error("No autenticado");
  return {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
}

export async function createStockConsumptionAction(
  projectId: string,
  input: CreateStockConsumptionInput,
) {
  try {
    const ctx = await getCtx();
    const movement = await createStockConsumption({ ...input, projectId }, ctx);
    revalidatePath(`/proyectos/${projectId}/consumos`);
    revalidatePath(`/proyectos/${projectId}/inventario`);
    revalidatePath("/inventario/movimientos");
    return { id: movement.id };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}
