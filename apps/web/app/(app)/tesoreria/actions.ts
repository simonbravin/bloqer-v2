"use server";

import {
  createTreasuryAccount,
  updateTreasuryAccount,
  deactivateTreasuryAccount,
  reactivateTreasuryAccount,
  createInternalTransfer,
  cancelInternalTransfer,
  ServiceError,
} from "@bloqer/services";
import {
  createTreasuryAccountSchema,
  updateTreasuryAccountSchema,
  createInternalTransferSchema,
  type CreateTreasuryAccountInput,
  type UpdateTreasuryAccountInput,
  type CreateInternalTransferInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
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
  const ctx = await getCtx();
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
  const ctx = await getCtx();
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
  const ctx = await getCtx();
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
  const ctx = await getCtx();
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
  const ctx = await getCtx();
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

export async function cancelInternalTransferAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelInternalTransfer(id, ctx);
    revalidatePath("/tesoreria");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

/** Form-friendly wrapper (void return for client components). */
export async function cancelInternalTransferFormAction(
  id: string,
  _formData: FormData,
): Promise<void> {
  await cancelInternalTransferAction(id);
}
