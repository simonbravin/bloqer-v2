"use server";

import {
  createJobsiteLog,
  updateJobsiteLog,
  submitJobsiteLog,
  approveJobsiteLog,
  returnJobsiteLog,
  cancelJobsiteLog,
  getSourceStockPreview,
  ServiceError,
} from "@bloqer/services";
import {
  createJobsiteLogSchema,
  updateJobsiteLogSchema,
  returnJobsiteLogSchema,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type Ok = { ok: true };
type Err = { error: string };

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

function handle(err: unknown): Err {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

function parseJsonArray(fd: FormData, key: string) {
  try {
    return JSON.parse((fd.get(key) as string) ?? "[]");
  } catch {
    return [];
  }
}

function revalidateJobsiteLogPaths(projectId: string, logId: string) {
  revalidatePath(`/proyectos/${projectId}/libro-obra`);
  revalidatePath(`/proyectos/${projectId}/libro-obra/${logId}`);
  revalidatePath(`/proyectos/${projectId}/libro-obra/${logId}/editar`);
}

function revalidateProjectSchedulePaths(projectId: string) {
  revalidatePath(`/proyectos/${projectId}/cronograma`);
  revalidatePath(`/proyectos/${projectId}`);
}

async function lifecycleAction(
  logId: string,
  projectId: string,
  fn: (id: string, ctx: Awaited<ReturnType<typeof getCtx>>, input?: { returnNotes: string }) => Promise<{ projectId: string }>,
  input?: { returnNotes: string },
  options?: { revalidateSchedule?: boolean },
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    const log = await fn(logId, ctx, input);
    revalidateJobsiteLogPaths(projectId, logId);
    if (log.projectId !== projectId) {
      revalidateJobsiteLogPaths(log.projectId, logId);
    }
    if (options?.revalidateSchedule) {
      revalidateProjectSchedulePaths(projectId);
      if (log.projectId !== projectId) {
        revalidateProjectSchedulePaths(log.projectId);
      }
    }
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createJobsiteLogAction(
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx = await getCtx();
    const raw = {
      companyId: fd.get("companyId") as string,
      projectId: fd.get("projectId") as string,
      logDate: fd.get("logDate") as string,
      title: (fd.get("title") as string) || null,
      workFront: (fd.get("workFront") as string) || null,
      shift: (fd.get("shift") as string) || null,
      weather: (fd.get("weather") as string) || null,
      generalNotes: (fd.get("generalNotes") as string) || null,
      blockers: (fd.get("blockers") as string) || null,
      incidents: (fd.get("incidents") as string) || null,
      safetyNotes: (fd.get("safetyNotes") as string) || null,
      progress: parseJsonArray(fd, "progress"),
      labor: parseJsonArray(fd, "labor"),
      materials: parseJsonArray(fd, "materials"),
      issues: parseJsonArray(fd, "issues"),
    };
    const input = createJobsiteLogSchema.parse(raw);
    const log = await createJobsiteLog(input, ctx);
    revalidateJobsiteLogPaths(input.projectId, log.id);
    return { id: log.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateJobsiteLogAction(
  logId: string,
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx = await getCtx();
    const raw = {
      logDate: (fd.get("logDate") as string) || undefined,
      title: (fd.get("title") as string) || null,
      workFront: (fd.get("workFront") as string) || null,
      shift: (fd.get("shift") as string) || null,
      weather: (fd.get("weather") as string) || null,
      generalNotes: (fd.get("generalNotes") as string) || null,
      blockers: (fd.get("blockers") as string) || null,
      incidents: (fd.get("incidents") as string) || null,
      safetyNotes: (fd.get("safetyNotes") as string) || null,
      progress: parseJsonArray(fd, "progress"),
      labor: parseJsonArray(fd, "labor"),
      materials: parseJsonArray(fd, "materials"),
      issues: parseJsonArray(fd, "issues"),
    };
    const input = updateJobsiteLogSchema.parse(raw);
    const log = await updateJobsiteLog(logId, input, ctx);
    revalidateJobsiteLogPaths(log.projectId, logId);
    return { id: log.id };
  } catch (err) {
    return handle(err);
  }
}

export async function submitJobsiteLogAction(
  logId: string,
  projectId: string,
): Promise<Ok | Err> {
  return lifecycleAction(logId, projectId, async (id, ctx) => submitJobsiteLog(id, ctx));
}

export async function approveJobsiteLogAction(
  logId: string,
  projectId: string,
): Promise<Ok | Err> {
  return lifecycleAction(
    logId,
    projectId,
    async (id, ctx) => approveJobsiteLog(id, ctx),
    undefined,
    { revalidateSchedule: true },
  );
}

export async function returnJobsiteLogAction(
  logId: string,
  projectId: string,
  data: { comment: string },
): Promise<Ok | Err> {
  const parsed = returnJobsiteLogSchema.safeParse({ returnNotes: data.comment });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  return lifecycleAction(
    logId,
    projectId,
    async (id, ctx, input) => returnJobsiteLog(id, input!, ctx),
    parsed.data,
    { revalidateSchedule: true },
  );
}

export async function cancelJobsiteLogAction(
  logId: string,
  projectId: string,
): Promise<Ok | Err> {
  return lifecycleAction(logId, projectId, async (id, ctx) => cancelJobsiteLog(id, ctx));
}

export async function getStockBalancePreviewAction(
  warehouseId: string,
  productId: string,
): Promise<{ balance: string } | Err> {
  const ctx = await getCtx();
  try {
    const balance = await getSourceStockPreview(warehouseId, productId, ctx);
    return { balance };
  } catch (err) {
    return handle(err);
  }
}
