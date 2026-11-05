"use server";

import { revalidateInventoryPaths } from "@/features/inventory/lib/revalidate-inventory-paths";
import { getCurrentUser } from "@/lib/auth";
import {
  createWarehouse,
  updateWarehouse,
  deactivateWarehouse,
  reactivateWarehouse,
  ServiceError,
} from "@bloqer/services";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "@bloqer/validators";

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

export async function createWarehouseAction(input: CreateWarehouseInput) {
  try {
    const ctx = await getCtx();
    const wh = await createWarehouse(input, ctx);
    revalidateInventoryPaths();
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
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function deactivateWarehouseAction(id: string) {
  try {
    const ctx = await getCtx();
    await deactivateWarehouse(id, ctx);
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function reactivateWarehouseAction(id: string) {
  try {
    const ctx = await getCtx();
    await reactivateWarehouse(id, ctx);
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}
