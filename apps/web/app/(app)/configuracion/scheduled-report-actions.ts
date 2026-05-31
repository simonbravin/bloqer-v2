"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createScheduledReport,
  deactivateScheduledReport,
  deleteScheduledReport,
  getScheduledReportById,
  reactivateScheduledReport,
  ServiceError,
  updateScheduledReport,
} from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  executeScheduledReportNow,
  executeScheduledReportRetryFailed,
} from "@/lib/scheduled-report-run";

function runResultMessage(summary: {
  runStatus: string;
  recipientsSent: number;
  recipientsFailed: number;
  recipientsSkipped: number;
  attachmentErrors: string[];
}): string {
  const parts = [
    `Estado: ${summary.runStatus}`,
    `enviados: ${summary.recipientsSent}`,
    `fallidos: ${summary.recipientsFailed}`,
    `omitidos: ${summary.recipientsSkipped}`,
  ];
  if (summary.attachmentErrors.length > 0) {
    parts.push(`adjuntos: ${summary.attachmentErrors.join("; ")}`);
  }
  return parts.join(" · ");
}

function revalidateScheduledReportPaths(projectId?: string | null) {
  revalidatePath("/configuracion/reportes");
  if (projectId) {
    revalidatePath(`/proyectos/${projectId}/reportes/programados`);
  }
}

export async function createScheduledReportAction(input: unknown) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  try {
    const created = await createScheduledReport(ctx, input);
    revalidateScheduledReportPaths(created.projectId);
    redirect(`/configuracion/reportes/${created.id}?ok=created`);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/configuracion/reportes/nuevo?err=${encodeURIComponent(e.message)}`);
    }
    redirect("/configuracion/reportes/nuevo?err=No+se+pudo+crear+el+env%C3%ADo+programado");
  }
}

export async function updateScheduledReportAction(input: unknown) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  try {
    const updated = await updateScheduledReport(ctx, input);
    revalidateScheduledReportPaths(updated.projectId);
    redirect(`/configuracion/reportes/${updated.id}?ok=updated`);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "VALIDATION") {
      const id =
        typeof input === "object" && input && "id" in input
          ? String((input as { id: string }).id)
          : "";
      if (id) {
        redirect(`/configuracion/reportes/${id}?err=${encodeURIComponent(e.message)}`);
      }
    }
    redirect("/configuracion/reportes?err=No+se+pudo+actualizar");
  }
}

export async function deactivateScheduledReportAction(id: string) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  try {
    await deactivateScheduledReport(ctx, id);
    revalidatePath("/configuracion/reportes");
    redirect(`/configuracion/reportes/${id}?ok=paused`);
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "No se pudo pausar";
    redirect(`/configuracion/reportes/${id}?err=${encodeURIComponent(msg)}`);
  }
}

export async function reactivateScheduledReportAction(id: string) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  try {
    await reactivateScheduledReport(ctx, id);
    revalidatePath("/configuracion/reportes");
    redirect(`/configuracion/reportes/${id}?ok=reactivated`);
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "No se pudo reactivar";
    redirect(`/configuracion/reportes/${id}?err=${encodeURIComponent(msg)}`);
  }
}

export async function runScheduledReportNowAction(id: string) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  try {
    const summary = await executeScheduledReportNow(ctx, id);
    const detail = await getScheduledReportById(ctx, id);
    revalidateScheduledReportPaths(detail.projectId);
    redirect(
      `/configuracion/reportes/${id}?ok=ran_now&detail=${encodeURIComponent(runResultMessage(summary))}`,
    );
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "No se pudo ejecutar el envío";
    redirect(`/configuracion/reportes/${id}?err=${encodeURIComponent(msg)}`);
  }
}

export async function retryScheduledReportFailedAction(id: string) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  try {
    const summary = await executeScheduledReportRetryFailed(ctx, id);
    const detail = await getScheduledReportById(ctx, id);
    revalidateScheduledReportPaths(detail.projectId);
    redirect(
      `/configuracion/reportes/${id}?ok=retried&detail=${encodeURIComponent(runResultMessage(summary))}`,
    );
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "No se pudo reintentar";
    redirect(`/configuracion/reportes/${id}?err=${encodeURIComponent(msg)}`);
  }
}

export async function deleteScheduledReportAction(id: string) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  try {
    await deleteScheduledReport(ctx, id);
    revalidatePath("/configuracion/reportes");
    redirect("/configuracion/reportes?ok=deleted");
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "No se pudo eliminar";
    redirect(`/configuracion/reportes/${id}?err=${encodeURIComponent(msg)}`);
  }
}
