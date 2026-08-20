"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  createWarehouseTransfer,
  cancelWarehouseTransfer,
  ServiceError,
} from "@bloqer/services";
import { createWarehouseTransferSchema } from "@bloqer/validators";
import { rethrowNextNavigationError } from "@/lib/next-errors";

function getCtx(current: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx!.tenantId,
    companyId:   current.tenantCtx!.companyId,
    roles:       current.tenantCtx!.roles,
  };
}

export async function createWarehouseTransferAction(
  fd: FormData,
): Promise<{ error?: string }> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) return { error: "No autenticado" };

  const raw = {
    sourceWarehouseId:      fd.get("sourceWarehouseId"),
    destinationWarehouseId: fd.get("destinationWarehouseId"),
    productId:              fd.get("productId"),
    transferDate:           fd.get("transferDate"),
    quantity:               fd.get("quantity"),
    unitCost:               fd.get("unitCost") || null,
    notes:                  fd.get("notes") || null,
    idempotencyKey:         fd.get("idempotencyKey"),
  };

  const parsed = createWarehouseTransferSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(", ");
    return { error: msg };
  }

  try {
    const transfer = await createWarehouseTransfer(parsed.data, getCtx(current));
    redirect(`/inventario/transferencias/${transfer.id}`);
  } catch (err: unknown) {
    rethrowNextNavigationError(err);
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error al crear transferencia" };
  }
}

export async function cancelWarehouseTransferAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) return { error: "No autenticado" };
  try {
    await cancelWarehouseTransfer(id, getCtx(current));
    return { ok: true };
  } catch (err: unknown) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error al cancelar transferencia" };
  }
}
