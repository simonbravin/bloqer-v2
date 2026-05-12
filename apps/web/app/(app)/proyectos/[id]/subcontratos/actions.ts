"use server";

import {
  createSubcontract,
  updateSubcontract,
  updateSubcontractMeta,
  activateSubcontract,
  completeSubcontract,
  cancelSubcontract,
  createSubcontractCertification,
  updateSubcontractCertification,
  issueSubcontractCertification,
  approveSubcontractCertification,
  rejectSubcontractCertification,
  cancelSubcontractCertification,
  ServiceError,
} from "@bloqer/services";
import {
  createSubcontractSchema,
  updateSubcontractSchema,
  updateSubcontractMetaSchema,
  createSubcontractCertificationSchema,
  updateSubcontractCertificationSchema,
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

// ─── Subcontract ──────────────────────────────────────────────────────────────

export async function createSubcontractAction(
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx  = await getCtx();
    const raw  = {
      companyId:              fd.get("companyId") as string,
      projectId:              fd.get("projectId") as string,
      subcontractorContactId: fd.get("subcontractorContactId") as string,
      title:                  fd.get("title") as string,
      description:            fd.get("description") as string || null,
      contractDate:           fd.get("contractDate") as string,
      startDate:              (fd.get("startDate") as string) || null,
      expectedEndDate:        (fd.get("expectedEndDate") as string) || null,
      currency:               (fd.get("currency") as string) || "ARS",
      notes:                  (fd.get("notes") as string) || null,
      internalNotes:          (fd.get("internalNotes") as string) || null,
      lines:                  JSON.parse(fd.get("lines") as string),
    };
    const parsed = createSubcontractSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
    const result = await createSubcontract(parsed.data, ctx);
    revalidatePath(`/proyectos/${parsed.data.projectId}/subcontratos`);
    return { id: result.id };
  } catch (err) { return handle(err); }
}

export async function updateSubcontractAction(
  id: string,
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx = await getCtx();
    const raw = {
      title:           fd.get("title") as string || undefined,
      description:     (fd.get("description") as string) || null,
      contractDate:    (fd.get("contractDate") as string) || undefined,
      startDate:       (fd.get("startDate") as string) || null,
      expectedEndDate: (fd.get("expectedEndDate") as string) || null,
      notes:           (fd.get("notes") as string) || null,
      internalNotes:   (fd.get("internalNotes") as string) || null,
      lines:           fd.get("lines") ? JSON.parse(fd.get("lines") as string) : undefined,
    };
    const parsed = updateSubcontractSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
    const result = await updateSubcontract(id, parsed.data, ctx);
    revalidatePath(`/proyectos/${result.projectId}/subcontratos`);
    return { id };
  } catch (err) { return handle(err); }
}

export async function updateSubcontractMetaAction(
  id: string,
  projectId: string,
  fd: FormData,
): Promise<{ error: string } | { ok: true }> {
  try {
    const ctx = await getCtx();
    const raw = {
      notes:           (fd.get("notes") as string) || null,
      internalNotes:   (fd.get("internalNotes") as string) || null,
      expectedEndDate: (fd.get("expectedEndDate") as string) || null,
      startDate:       (fd.get("startDate") as string) || null,
    };
    const parsed = updateSubcontractMetaSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
    await updateSubcontractMeta(id, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function activateSubcontractAction(id: string, projectId: string): Promise<void> {
  const ctx = await getCtx();
  await activateSubcontract(id, ctx);
  revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
}

export async function completeSubcontractAction(id: string, projectId: string): Promise<void> {
  const ctx = await getCtx();
  await completeSubcontract(id, ctx);
  revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
}

export async function cancelSubcontractAction(id: string, projectId: string): Promise<void> {
  const ctx = await getCtx();
  await cancelSubcontract(id, ctx);
  revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
}

// ─── Certification ────────────────────────────────────────────────────────────

export async function createSubcontractCertificationAction(
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx = await getCtx();
    const raw = {
      subcontractId:     fd.get("subcontractId") as string,
      periodStart:       fd.get("periodStart") as string,
      periodEnd:         fd.get("periodEnd") as string,
      certificationDate: fd.get("certificationDate") as string,
      notes:             (fd.get("notes") as string) || null,
      lines:             JSON.parse(fd.get("lines") as string),
    };
    const parsed = createSubcontractCertificationSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
    const result = await createSubcontractCertification(parsed.data, ctx);
    revalidatePath(`/proyectos`);
    return { id: result.id };
  } catch (err) { return handle(err); }
}

export async function updateSubcontractCertificationAction(
  id: string,
  fd: FormData,
): Promise<{ error: string } | { ok: true }> {
  try {
    const ctx = await getCtx();
    const raw = {
      periodStart:       (fd.get("periodStart") as string) || undefined,
      periodEnd:         (fd.get("periodEnd") as string) || undefined,
      certificationDate: (fd.get("certificationDate") as string) || undefined,
      notes:             (fd.get("notes") as string) || null,
      lines:             fd.get("lines") ? JSON.parse(fd.get("lines") as string) : undefined,
    };
    const parsed = updateSubcontractCertificationSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
    await updateSubcontractCertification(id, parsed.data, ctx);
    revalidatePath(`/proyectos`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function issueSubcontractCertificationAction(id: string, subcontractId: string, projectId: string): Promise<void> {
  const ctx = await getCtx();
  await issueSubcontractCertification(id, ctx);
  revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
}

export async function approveSubcontractCertificationAction(id: string, subcontractId: string, projectId: string): Promise<void> {
  const ctx = await getCtx();
  await approveSubcontractCertification(id, ctx);
  revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
}

export async function rejectSubcontractCertificationAction(id: string, subcontractId: string, projectId: string): Promise<void> {
  const ctx = await getCtx();
  await rejectSubcontractCertification(id, ctx);
  revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
}

export async function cancelSubcontractCertificationAction(id: string, subcontractId: string, projectId: string): Promise<void> {
  const ctx = await getCtx();
  await cancelSubcontractCertification(id, ctx);
  revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
}
