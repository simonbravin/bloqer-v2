"use server";

import {
  createTreasuryAccount,
  updateTreasuryAccount,
  deactivateTreasuryAccount,
  reactivateTreasuryAccount,
  createInternalTransfer,
  cancelInternalTransfer,
  registerManualTreasuryAdjustment,
  ServiceError,
} from "@bloqer/services";
import {
  createTreasuryAccountSchema,
  updateTreasuryAccountSchema,
  createInternalTransferSchema,
  createManualTreasuryAdjustmentSchema,
  type CreateTreasuryAccountInput,
  type UpdateTreasuryAccountInput,
  type CreateInternalTransferInput,
  type CreateManualTreasuryAdjustmentInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { serverLog } from "@/lib/server-log";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

async function getCtx(action?: string) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (action) {
    const h = await headers();
    serverLog({
      message: "tesoreria_action",
      action,
      requestId: h.get("x-request-id"),
      tenantId: current.tenantCtx.tenantId,
      companyId: current.tenantCtx.companyId,
    });
  }
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };
}

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

export async function createTreasuryAccountAction(
  data: CreateTreasuryAccountInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx("createTreasuryAccount");
  const parsed = createTreasuryAccountSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const acc = await createTreasuryAccount(parsed.data, ctx);
    revalidatePath("/tesoreria");
    return { id: acc.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateTreasuryAccountAction(
  id: string,
  data: UpdateTreasuryAccountInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx("updateTreasuryAccount");
  const parsed = updateTreasuryAccountSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateTreasuryAccount(id, parsed.data, ctx);
    revalidatePath("/tesoreria");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deactivateTreasuryAccountAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx("deactivateTreasuryAccount");
  try {
    await deactivateTreasuryAccount(id, ctx);
    revalidatePath("/tesoreria");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function reactivateTreasuryAccountAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx("reactivateTreasuryAccount");
  try {
    await reactivateTreasuryAccount(id, ctx);
    revalidatePath("/tesoreria");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createInternalTransferAction(
  data: CreateInternalTransferInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx("createInternalTransfer");
  const parsed = createInternalTransferSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const transfer = await createInternalTransfer(parsed.data, ctx);
    revalidatePath("/tesoreria");
    return { id: transfer.id };
  } catch (err) {
    return handle(err);
  }
}

export async function registerManualTreasuryAdjustmentAction(
  data: CreateManualTreasuryAdjustmentInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx("registerManualTreasuryAdjustment");
  const parsed = createManualTreasuryAdjustmentSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const result = await registerManualTreasuryAdjustment(parsed.data, ctx);
    revalidatePath("/tesoreria");
    revalidatePath(`/tesoreria/cuentas/${parsed.data.accountId}`);
    return { id: result.id };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelInternalTransferAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx("cancelInternalTransfer");
  try {
    await cancelInternalTransfer(id, ctx);
    revalidatePath("/tesoreria");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
