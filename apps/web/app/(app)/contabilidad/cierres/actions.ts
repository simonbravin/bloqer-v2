"use server";

import {
  closeFinancialPeriod,
  reopenFinancialPeriod,
  ServiceError,
} from "@bloqer/services";
import {
  closePeriodSchema,
  reopenPeriodSchema,
  type ClosePeriodInput,
  type ReopenPeriodInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PATH = "/contabilidad/cierres";

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

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

export async function closeFinancialPeriodAction(
  data: ClosePeriodInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = closePeriodSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await closeFinancialPeriod(parsed.data, ctx);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function reopenFinancialPeriodAction(
  data: ReopenPeriodInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = reopenPeriodSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await reopenFinancialPeriod(parsed.data, ctx);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
