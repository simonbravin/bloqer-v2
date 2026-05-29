"use server";

import {
  createProjectOverheadAllocation,
  deleteProjectOverheadAllocation,
  ServiceError,
  updateCompanyOverheadAllocationPct,
} from "@bloqer/services";
import {
  createProjectOverheadAllocationSchema,
  updateCompanyOverheadPctSchema,
  type CreateProjectOverheadAllocationInput,
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
