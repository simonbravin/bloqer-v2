"use server";

import {
  createCertification,
  updateCertification,
  issueCertification,
  approveCertification,
  rejectCertification,
  cancelCertification,
  addCertificationLine,
  updateCertificationLine,
  removeCertificationLine,
  refreshPreviousQty,
  saveCertificationMeasurement,
  getCertificationById,
  ServiceError,
} from "@bloqer/services";
import {
  createCertificationSchema,
  updateCertificationSchema,
  addCertificationLineSchema,
  updateCertificationLineSchema,
  saveCertificationMeasurementSchema,
  type CreateCertificationInput,
  type UpdateCertificationInput,
  type AddCertificationLineInput,
  type UpdateCertificationLineInput,
  type SaveCertificationMeasurementInput,
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

async function assertCertificationPath(
  certId: string,
  projectId: string,
  ctx: Awaited<ReturnType<typeof getCtx>>,
  lineId?: string,
) {
  const cert = await getCertificationById(certId, ctx);
  if (cert.projectId !== projectId || (lineId && !cert.lines.some((line) => line.id === lineId))) {
    throw new ServiceError("CONFLICT", "La certificación o su línea no corresponde a esta obra.");
  }
  return cert;
}

// ─── Certification ────────────────────────────────────────────────────────────

export async function createCertificationAction(
  projectId: string,
  data: CreateCertificationInput,
): Promise<{ id: string } | Err> {
  const ctx = await getCtx();
  const parsed = createCertificationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  if (parsed.data.projectId !== projectId)
    return { error: "La certificación no corresponde a esta obra." };
  try {
    const cert = await createCertification(parsed.data, ctx);
    revalidateCertificationPaths(cert.projectId, cert.id);
    return { id: cert.id };
  } catch (err) {
    return handle(err);
  }
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
    await assertCertificationPath(certId, projectId, ctx);
    await updateCertification(certId, parsed.data, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

function revalidateCertificationPaths(projectId: string, certId: string) {
  revalidatePath(`/proyectos/${projectId}/certificaciones`);
  revalidatePath(`/proyectos/${projectId}/certificaciones/${certId}`);
  revalidatePath(`/proyectos/${projectId}/certificaciones/${certId}/editar`);
  revalidatePath(`/proyectos/${projectId}/reportes/certificaciones`);
  revalidatePath(`/proyectos/${projectId}/reportes/avances`);
  revalidatePath("/pendientes");
  revalidateProjectCostAndFinancePaths(projectId);
}

async function lifecycleAction(
  certId: string,
  projectId: string,
  fn: (id: string, ctx: Awaited<ReturnType<typeof getCtx>>) => Promise<unknown>,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await assertCertificationPath(certId, projectId, ctx);
    await fn(certId, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
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
export async function cancelCertificationAction(id: string, projectId: string, reason?: string) {
  return lifecycleAction(id, projectId, (certId, ctx) => cancelCertification(certId, ctx, reason));
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
    await assertCertificationPath(parsed.data.certificationId, projectId, ctx);
    const result = await addCertificationLine(parsed.data, ctx);
    revalidateCertificationPaths(projectId, data.certificationId);
    return result;
  } catch (err) {
    return handle(err);
  }
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
    await assertCertificationPath(certId, projectId, ctx, lineId);
    await updateCertificationLine(lineId, parsed.data, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function removeCertificationLineAction(
  projectId: string,
  certId: string,
  lineId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await assertCertificationPath(certId, projectId, ctx, lineId);
    await removeCertificationLine(lineId, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function saveCertificationMeasurementAction(
  projectId: string,
  data: SaveCertificationMeasurementInput,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  const parsed = saveCertificationMeasurementSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await assertCertificationPath(parsed.data.certificationId, projectId, ctx);
    await saveCertificationMeasurement(parsed.data, ctx);
    revalidateCertificationPaths(projectId, data.certificationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function refreshPreviousQtyAction(
  projectId: string,
  certId: string,
): Promise<Ok | Err> {
  const ctx = await getCtx();
  try {
    await assertCertificationPath(certId, projectId, ctx);
    await refreshPreviousQty(certId, ctx);
    revalidateCertificationPaths(projectId, certId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
