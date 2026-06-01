"use server";

import {
  closeOverheadPeriod,
  createProjectOverheadAllocation,
  deleteProjectOverheadAllocation,
  AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
  getAutoWeightOverheadPreviewForPeriod,
  reopenOverheadPeriod,
  ServiceError,
  updateCompanyOverheadAllocationMode,
  updateCompanyOverheadAllocationPct,
} from "@bloqer/services";
import {
  autoWeightPreviewQuerySchema,
  createProjectOverheadAllocationSchema,
  overheadPeriodActionSchema,
  updateCompanyOverheadModeSchema,
  updateCompanyOverheadPctSchema,
  type AutoWeightPreviewQueryInput,
  type CreateProjectOverheadAllocationInput,
  type OverheadPeriodActionInput,
  type UpdateCompanyOverheadModeInput,
  type UpdateCompanyOverheadPctInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PATH = "/finanzas/gastos-generales";

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

export async function createOverheadAllocationAction(
  data: CreateProjectOverheadAllocationInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createProjectOverheadAllocationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await createProjectOverheadAllocation(parsed.data, ctx);
    revalidatePath(PATH);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteOverheadAllocationAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await deleteProjectOverheadAllocation(id, ctx);
    revalidatePath(PATH);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function updateCompanyOverheadPctAction(
  data: UpdateCompanyOverheadPctInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateCompanyOverheadPctSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateCompanyOverheadAllocationPct(
      parsed.data.companyId,
      parsed.data.overheadAllocationPct,
      ctx,
    );
    revalidatePath(PATH);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function updateCompanyOverheadModeAction(
  data: UpdateCompanyOverheadModeInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateCompanyOverheadModeSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateCompanyOverheadAllocationMode(
      parsed.data.companyId,
      parsed.data.overheadAllocationMode,
      ctx,
    );
    revalidatePath(PATH);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function closeOverheadPeriodAction(
  data: OverheadPeriodActionInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = overheadPeriodActionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await closeOverheadPeriod(parsed.data.companyId, parsed.data.period, ctx);
    revalidatePath(PATH);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function reopenOverheadPeriodAction(
  data: OverheadPeriodActionInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = overheadPeriodActionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await reopenOverheadPeriod(parsed.data.companyId, parsed.data.period, ctx);
    revalidatePath(PATH);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function fetchAutoWeightPreviewAction(
  data: AutoWeightPreviewQueryInput,
): Promise<
  | { ok: true; preview: Awaited<ReturnType<typeof getAutoWeightOverheadPreviewForPeriod>> }
  | { error: string }
> {
  const ctx = await getCtx();
  const parsed = autoWeightPreviewQuerySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const preview = await getAutoWeightOverheadPreviewForPeriod(
      parsed.data.companyId,
      parsed.data.period,
      ctx,
      AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
    );
    return { ok: true, preview };
  } catch (err) {
    return handle(err);
  }
}
