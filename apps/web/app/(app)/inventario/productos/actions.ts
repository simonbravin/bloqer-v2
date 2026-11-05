"use server";

import { revalidateInventoryPaths } from "@/features/inventory/lib/revalidate-inventory-paths";
import { getCurrentUser } from "@/lib/auth";
import {
  createProduct,
  updateProduct,
  deactivateProduct,
  reactivateProduct,
  ServiceError,
} from "@bloqer/services";
import type { CreateProductInput, UpdateProductInput } from "@bloqer/validators";

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

export async function createProductAction(input: CreateProductInput) {
  try {
    const ctx = await getCtx();
    const product = await createProduct(input, ctx);
    revalidateInventoryPaths();
    return { id: product.id };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function updateProductAction(id: string, input: UpdateProductInput) {
  try {
    const ctx = await getCtx();
    await updateProduct(id, input, ctx);
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function deactivateProductAction(id: string) {
  try {
    const ctx = await getCtx();
    await deactivateProduct(id, ctx);
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

export async function reactivateProductAction(id: string) {
  try {
    const ctx = await getCtx();
    await reactivateProduct(id, ctx);
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}
