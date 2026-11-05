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
import { revalidateProjectCostAndFinancePaths } from "@/lib/revalidate-project-paths";
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

/** On update: missing key → leave DB value; present empty → clear field. */
function optionalFormText(fd: FormData, key: string): string | null | undefined {
  if (!fd.has(key)) return undefined;
  const raw = fd.get(key);
  if (raw == null || raw === "") return null;
  return String(raw);
}

function parseJsonArray(fd: FormData, key: string, required = false): unknown[] {
  const raw = fd.get(key);
  if (!required && (raw == null || raw === "")) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch { /* Malformed JSON follows the same error path as a non-array. */ }
  throw new Error(`Campo "${key}" inválido`);
}

function revalidateJobsiteLogPaths(projectId: string, logId: string) {
  revalidatePath(`/proyectos/${projectId}/libro-obra`);
  revalidatePath(`/proyectos/${projectId}/libro-obra/${logId}`);
  revalidatePath(`/proyectos/${projectId}/libro-obra/${logId}/editar`);
}

function revalidateProjectSchedulePaths(projectId: string) {
  revalidatePath(`/proyectos/${projectId}/cronograma`);
  revalidateProjectCostAndFinancePaths(projectId);
}

async function lifecycleAction(
  logId: string,
  fn: (id: string, ctx: Awaited<ReturnType<typeof getCtx>>) => Promise<{ projectId: string }>,
  options?: { approved?: boolean },
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    const { projectId } = await fn(logId, ctx);
    revalidateJobsiteLogPaths(projectId, logId);
    revalidatePath("/dashboard");
    revalidatePath("/pendientes");
    revalidatePath(`/proyectos/${projectId}/pendientes`);
    revalidatePath(`/proyectos/${projectId}/reportes/avances`);
    if (options?.approved) {
      revalidateProjectSchedulePaths(projectId);
      revalidatePath("/inventario/movimientos");
      revalidatePath("/inventario/reportes/stock");
    }
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createJobsiteLogAction(
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  const ctx = await getCtx();
  try {
    let progress: unknown[];
    let labor: unknown[];
    let materials: unknown[];
    let issues: unknown[];
    try {
      progress = parseJsonArray(fd, "progress");
      labor = parseJsonArray(fd, "labor");
      materials = parseJsonArray(fd, "materials");
      issues = parseJsonArray(fd, "issues");
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Datos de líneas inválidos" };
    }
    const rawCompanyId = fd.get("companyId");
    const parsed = createJobsiteLogSchema.safeParse({
      companyId:
        typeof rawCompanyId === "string" && rawCompanyId.trim() !== ""
          ? rawCompanyId
          : undefined,
      projectId: fd.get("projectId") as string,
      logDate: fd.get("logDate") as string,
      title: (fd.get("title") as string) || null,
      workFront: (fd.get("workFront") as string) || null,
      shift: (fd.get("shift") as string) || null,
      weather: (fd.get("weather") as string) || null,
      generalNotes: (fd.get("generalNotes") as string) || null,
      // Free-text legacy fields: no UI capture; persist null on create.
      blockers: null,
      incidents: null,
      safetyNotes: null,
      progress,
      labor,
      materials,
      issues,
      idempotencyKey: fd.get("idempotencyKey") as string,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const log = await createJobsiteLog(parsed.data, ctx);
    revalidateJobsiteLogPaths(log.projectId, log.id);
    return { id: log.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateJobsiteLogAction(
  logId: string,
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  const ctx = await getCtx();
  try {
    let progress: unknown[];
    let labor: unknown[];
    let materials: unknown[];
    let issues: unknown[];
    try {
      progress = parseJsonArray(fd, "progress", true);
      labor = parseJsonArray(fd, "labor", true);
      materials = parseJsonArray(fd, "materials", true);
      issues = parseJsonArray(fd, "issues", true);
    } catch (err) {
      // Never fall back to [] on update — that would wipe existing children.
      return { error: err instanceof Error ? err.message : "Datos de líneas inválidos" };
    }
    // Do NOT send blockers/incidents/safetyNotes — omitting keeps legacy values (service undefined → existing).
    const parsed = updateJobsiteLogSchema.safeParse({
      logDate: (fd.get("logDate") as string) || undefined,
      title: optionalFormText(fd, "title"),
      workFront: optionalFormText(fd, "workFront"),
      shift: optionalFormText(fd, "shift"),
      weather: optionalFormText(fd, "weather"),
      generalNotes: optionalFormText(fd, "generalNotes"),
      progress,
      labor,
      materials,
      issues,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const log = await updateJobsiteLog(logId, parsed.data, ctx);
    revalidateJobsiteLogPaths(log.projectId, logId);
    return { id: log.id };
  } catch (err) {
    return handle(err);
  }
}

export async function submitJobsiteLogAction(
  logId: string,
): Promise<Ok | Err> {
  return lifecycleAction(logId, submitJobsiteLog);
}

export async function approveJobsiteLogAction(
  logId: string,
): Promise<Ok | Err> {
  return lifecycleAction(logId, approveJobsiteLog, { approved: true });
}

export async function returnJobsiteLogAction(
  logId: string,
  data: { comment: string },
): Promise<Ok | Err> {
  const parsed = returnJobsiteLogSchema.safeParse({ returnNotes: data?.comment });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  return lifecycleAction(logId, (id, ctx) => returnJobsiteLog(id, parsed.data, ctx));
}

export async function cancelJobsiteLogAction(
  logId: string,
): Promise<Ok | Err> {
  return lifecycleAction(logId, cancelJobsiteLog);
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
