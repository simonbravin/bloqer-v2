"use server";

import {
  createJobsiteLog,
  updateJobsiteLog,
  submitJobsiteLog,
  approveJobsiteLog,
  returnJobsiteLog,
  cancelJobsiteLog,
  ServiceError,
} from "@bloqer/services";
import {
  createJobsiteLogSchema,
  updateJobsiteLogSchema,
  returnJobsiteLogSchema,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect }       from "next/navigation";
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

function parseJsonArray(fd: FormData, key: string) {
  try { return JSON.parse((fd.get(key) as string) ?? "[]"); } catch { return []; }
}

export async function createJobsiteLogAction(
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx = await getCtx();
    const raw = {
      companyId:    fd.get("companyId") as string,
      projectId:    fd.get("projectId") as string,
      logDate:      fd.get("logDate") as string,
      title:        (fd.get("title") as string) || null,
      workFront:    (fd.get("workFront") as string) || null,
      shift:        (fd.get("shift") as string) || null,
      weather:      (fd.get("weather") as string) || null,
      generalNotes: (fd.get("generalNotes") as string) || null,
      blockers:     (fd.get("blockers") as string) || null,
      incidents:    (fd.get("incidents") as string) || null,
      safetyNotes:  (fd.get("safetyNotes") as string) || null,
      progress:     parseJsonArray(fd, "progress"),
      labor:        parseJsonArray(fd, "labor"),
      materials:    parseJsonArray(fd, "materials"),
      issues:       parseJsonArray(fd, "issues"),
    };
    const input = createJobsiteLogSchema.parse(raw);
    const log   = await createJobsiteLog(input, ctx);
    revalidatePath(`/proyectos/${input.projectId}/libro-obra`);
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
      logDate:      (fd.get("logDate") as string) || undefined,
      title:        (fd.get("title") as string) || null,
      workFront:    (fd.get("workFront") as string) || null,
      shift:        (fd.get("shift") as string) || null,
      weather:      (fd.get("weather") as string) || null,
      generalNotes: (fd.get("generalNotes") as string) || null,
      blockers:     (fd.get("blockers") as string) || null,
      incidents:    (fd.get("incidents") as string) || null,
      safetyNotes:  (fd.get("safetyNotes") as string) || null,
      progress:     parseJsonArray(fd, "progress"),
      labor:        parseJsonArray(fd, "labor"),
      materials:    parseJsonArray(fd, "materials"),
      issues:       parseJsonArray(fd, "issues"),
    };
    const input = updateJobsiteLogSchema.parse(raw);
    const log   = await updateJobsiteLog(logId, input, ctx);
    revalidatePath(`/proyectos/${log.projectId}/libro-obra`);
    return { id: log.id };
  } catch (err) {
    return handle(err);
  }
}

export async function submitJobsiteLogAction(logId: string): Promise<void> {
  const ctx = await getCtx();
  const log = await submitJobsiteLog(logId, ctx);
  revalidatePath(`/proyectos/${log.projectId}/libro-obra`);
}

export async function approveJobsiteLogAction(logId: string): Promise<void> {
  const ctx = await getCtx();
  const log = await approveJobsiteLog(logId, ctx);
  revalidatePath(`/proyectos/${log.projectId}/libro-obra`);
}

export async function returnJobsiteLogAction(
  logId: string,
  fd: FormData,
): Promise<{ error: string } | void> {
  try {
    const ctx   = await getCtx();
    const input = returnJobsiteLogSchema.parse({ returnNotes: fd.get("returnNotes") as string });
    const log   = await returnJobsiteLog(logId, input, ctx);
    revalidatePath(`/proyectos/${log.projectId}/libro-obra`);
  } catch (err) {
    return handle(err);
  }
}

export async function cancelJobsiteLogAction(logId: string): Promise<void> {
  const ctx = await getCtx();
  const log = await cancelJobsiteLog(logId, ctx);
  revalidatePath(`/proyectos/${log.projectId}/libro-obra`);
}
