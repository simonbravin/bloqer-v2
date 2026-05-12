"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  createWarehouse, updateWarehouse, deactivateWarehouse, reactivateWarehouse, ServiceError,
} from "@bloqer/services";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "@bloqer/validators";

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) throw new Error("No autenticado");
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };
}

export async function createWarehouseAction(input: CreateWarehouseInput) {
  try {
    const ctx = await getCtx();
    const wh = await createWarehouse(input, ctx);
    revalidatePath("/inventario/depositos");
    return { id: wh.id };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function updateWarehouseAction(id: string, input: UpdateWarehouseInput) {
  try {
    const ctx = await getCtx();
    await updateWarehouse(id, input, ctx);
    revalidatePath(`/inventario/depositos/${id}`);
    revalidatePath("/inventario/depositos");
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function deactivateWarehouseAction(id: string) {
  try {
    const ctx = await getCtx();
    await deactivateWarehouse(id, ctx);
    revalidatePath(`/inventario/depositos/${id}`);
    revalidatePath("/inventario/depositos");
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function reactivateWarehouseAction(id: string) {
  try {
    const ctx = await getCtx();
    await reactivateWarehouse(id, ctx);
    revalidatePath(`/inventario/depositos/${id}`);
    revalidatePath("/inventario/depositos");
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}
