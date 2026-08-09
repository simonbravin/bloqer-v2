"use server";

import {
  createCertification, updateCertification,
  issueCertification, approveCertification, rejectCertification, cancelCertification,
  addCertificationLine, updateCertificationLine, removeCertificationLine, refreshPreviousQty,
  ServiceError,
} from "@bloqer/services";
import {
  createCertificationSchema, updateCertificationSchema,
  addCertificationLineSchema, updateCertificationLineSchema,
  type CreateCertificationInput, type UpdateCertificationInput,
  type AddCertificationLineInput, type UpdateCertificationLineInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { revalidateProjectCostAndFinancePaths } from "@/lib/revalidate-project-paths";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type Ok  = { ok: true };
type Err = { error: string };

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

function handle(err: unknown): Err {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

// ─── Certification ────────────────────────────────────────────────────────────

export async function createCertificationAction(
  projectId: string,
  data: CreateCertificationInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createCertificationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const cert = await createCertification(parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/certificaciones`);
    return { id: cert.id };
  } catch (err) { return handle(err); }
}

export async function updateCertificationAction(
  certId: string,
  projectId: string,
  data: UpdateCertificationInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateCertificationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateCertification(certId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/certificaciones`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

function revalidateCertificationPaths(projectId: string, certId: string) {
  revalidatePath(`/proyectos/${projectId}/certificaciones`);
  revalidatePath(`/proyectos/${projectId}/certificaciones/${certId}`);
  revalidateProjectCostAndFinancePaths(projectId);
}

async function lifecycleAction(
  certId: string,
  projectId: string,
  fn: (id: string, ctx: Awaited<ReturnType<typeof getCtx>>) => Promise<unknown>,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await fn(certId, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function issueCertificationAction(id: string, projectId: string) {
  return lifecycleAction(id, projectId, issueCertification);
}
export async function approveCertificationAction(id: string, projectId: string) {
  return lifecycleAction(id, projectId, approveCertification);
}
export async function rejectCertificationAction(id: string, projectId: string) {
  return lifecycleAction(id, projectId, rejectCertification);
}
export async function cancelCertificationAction(id: string, projectId: string) {
  return lifecycleAction(id, projectId, cancelCertification);
}

// ─── Lines ────────────────────────────────────────────────────────────────────

export async function addCertificationLineAction(
  projectId: string,
  data: AddCertificationLineInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = addCertificationLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const result = await addCertificationLine(parsed.data, ctx);
    revalidateCertificationPaths(projectId, data.certificationId);
    return result;
  } catch (err) { return handle(err); }
}

export async function updateCertificationLineAction(
  projectId: string,
  certId: string,
  lineId: string,
  data: UpdateCertificationLineInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = updateCertificationLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateCertificationLine(lineId, parsed.data, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function removeCertificationLineAction(
  projectId: string,
  certId: string,
  lineId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await removeCertificationLine(lineId, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function refreshPreviousQtyAction(
  projectId: string,
  certId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await refreshPreviousQty(certId, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) { return handle(err); }
}
