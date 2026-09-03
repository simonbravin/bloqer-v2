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
  uploadDocument,
  ServiceError,
} from "@bloqer/services";
import {
  createSubcontractSchema,
  updateSubcontractSchema,
  updateSubcontractMetaSchema,
  createSubcontractCertificationSchema,
  updateSubcontractCertificationSchema,
  initiateUploadSchema,
  resolveAllowedMimeType,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { revalidateProjectCostAndFinancePaths } from "@/lib/revalidate-project-paths";
import { redirect }       from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import {
  CREATE_ATTACHMENT_TOTAL_MB,
  MAX_CREATE_ATTACHMENT_FILES,
  MAX_CREATE_ATTACHMENT_TOTAL_BYTES,
} from "@/features/subcontracts/lib/create-attachment-limits";

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

export type CreateSubcontractActionResult =
  | { error: string }
  | { id: string; attachmentWarning?: string };

function parseLinesJson(
  raw: FormDataEntryValue | null,
  invalidMessage = "Datos inválidos en líneas del subcontrato",
): { lines: unknown } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: invalidMessage };
  }
  try {
    return { lines: JSON.parse(raw) };
  } catch {
    return { error: invalidMessage };
  }
}

type UploadFileLike = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

/** Duck-type File/Blob: `instanceof File` can fail across Next server-action realms. */
function asUploadFile(value: FormDataEntryValue): UploadFileLike | null {
  if (typeof value !== "object" || value === null) return null;
  const blob = value as Blob & { name?: unknown; type?: unknown };
  if (typeof blob.size !== "number" || blob.size <= 0) return null;
  if (typeof blob.arrayBuffer !== "function") return null;
  if (typeof blob.name !== "string" || !blob.name.trim()) return null;
  return {
    name: blob.name,
    type: typeof blob.type === "string" ? blob.type : "",
    size: blob.size,
    arrayBuffer: () => blob.arrayBuffer(),
  };
}

function collectAttachmentFiles(fd: FormData): {
  files: UploadFileLike[];
  unreadableCount: number;
} {
  const entries = fd.getAll("attachments");
  const files: UploadFileLike[] = [];
  let unreadableCount = 0;
  for (const entry of entries) {
    const file = asUploadFile(entry);
    if (file) files.push(file);
    else unreadableCount += 1;
  }
  return { files, unreadableCount };
}

function validateCreateAttachments(files: UploadFileLike[]): { error: string } | null {
  if (files.length > MAX_CREATE_ATTACHMENT_FILES) {
    return {
      error: `Máximo ${MAX_CREATE_ATTACHMENT_FILES} adjuntos al crear. Quitá algunos o agregalos después en el detalle.`,
    };
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_CREATE_ATTACHMENT_TOTAL_BYTES) {
    return {
      error: `Los adjuntos superan ${CREATE_ATTACHMENT_TOTAL_MB} MB. Quitá archivos o subilos después desde el detalle.`,
    };
  }
  return null;
}

function attachmentFailureSummary(failed: string[]): string {
  return `Subcontrato creado. No se pudieron adjuntar ${failed.length} archivo${failed.length === 1 ? "" : "s"}: ${failed.join("; ")}. Reintentá desde el detalle.`;
}

async function uploadCreateAttachments(
  files: UploadFileLike[],
  projectId: string,
  subcontractId: string,
  ctx: Awaited<ReturnType<typeof getCtx>>,
  unreadableCount: number,
): Promise<string | undefined> {
  const failed: string[] = [];
  if (unreadableCount > 0) {
    failed.push(
      `${unreadableCount} archivo${unreadableCount === 1 ? "" : "s"} no se pudieron leer`,
    );
  }

  for (const file of files) {
    const mimeType = resolveAllowedMimeType(file.name, file.type);
    if (!mimeType) {
      failed.push(`${file.name} (tipo no permitido)`);
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = initiateUploadSchema.safeParse({
        projectId,
        originalFileName: file.name,
        mimeType,
        sizeBytes: buffer.length,
        category: "CONTRACT",
        linkedEntityType: "SUBCONTRACT",
        linkedEntityId: subcontractId,
        idempotencyKey: randomUUID(),
      });
      if (!parsed.success) {
        failed.push(`${file.name} (${parsed.error.issues[0]?.message ?? "inválido"})`);
        continue;
      }
      await uploadDocument(parsed.data, buffer, ctx);
    } catch (err) {
      const message = err instanceof ServiceError ? err.message : "no se pudo subir";
      failed.push(`${file.name} (${message})`);
    }
  }

  if (failed.length === 0) return undefined;
  return attachmentFailureSummary(failed);
}

// ─── Subcontract ──────────────────────────────────────────────────────────────

export async function createSubcontractAction(
  fd: FormData,
): Promise<CreateSubcontractActionResult> {
  try {
    const ctx  = await getCtx();
    const linesParsed = parseLinesJson(fd.get("lines"));
    if ("error" in linesParsed) return linesParsed;
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
      lines:                  linesParsed.lines,
    };
    const parsed = createSubcontractSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

    const { files, unreadableCount } = collectAttachmentFiles(fd);
    const attachmentGate = validateCreateAttachments(files);
    if (attachmentGate) return attachmentGate;

    const result = await createSubcontract(parsed.data, ctx);
    revalidatePath(`/proyectos/${parsed.data.projectId}/subcontratos`);
    revalidateProjectCostAndFinancePaths(parsed.data.projectId);

    const attachmentWarning = await uploadCreateAttachments(
      files,
      parsed.data.projectId,
      result.id,
      ctx,
      unreadableCount,
    );
    revalidatePath(`/proyectos/${parsed.data.projectId}/subcontratos/${result.id}`);

    return attachmentWarning ? { id: result.id, attachmentWarning } : { id: result.id };
  } catch (err) { return handle(err); }
}

export async function updateSubcontractAction(
  id: string,
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx = await getCtx();
    const linesRaw = fd.get("lines");
    let lines: unknown | undefined;
    if (linesRaw) {
      const linesParsed = parseLinesJson(linesRaw);
      if ("error" in linesParsed) return linesParsed;
      lines = linesParsed.lines;
    }
    const raw = {
      title:           fd.get("title") as string || undefined,
      description:     (fd.get("description") as string) || null,
      contractDate:    (fd.get("contractDate") as string) || undefined,
      startDate:       (fd.get("startDate") as string) || null,
      expectedEndDate: (fd.get("expectedEndDate") as string) || null,
      notes:           (fd.get("notes") as string) || null,
      internalNotes:   (fd.get("internalNotes") as string) || null,
      lines,
    };
    const parsed = updateSubcontractSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    const result = await updateSubcontract(id, parsed.data, ctx);
    revalidatePath(`/proyectos/${result.projectId}/subcontratos`);
    revalidateProjectCostAndFinancePaths(result.projectId);
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
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    await updateSubcontractMeta(id, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function activateSubcontractAction(
  id: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getCtx();
    await activateSubcontract(id, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function completeSubcontractAction(
  id: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getCtx();
    await completeSubcontract(id, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelSubcontractAction(
  id: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getCtx();
    await cancelSubcontract(id, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${id}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

// ─── Certification ────────────────────────────────────────────────────────────

export async function createSubcontractCertificationAction(
  fd: FormData,
): Promise<{ error: string } | { id: string }> {
  try {
    const ctx = await getCtx();
    const replacesRaw = fd.get("replacesCertificationId");
    let lines: unknown;
    try {
      lines = JSON.parse(String(fd.get("lines") ?? ""));
    } catch {
      return { error: "Datos inválidos en líneas de certificación" };
    }
    const raw = {
      subcontractId:     fd.get("subcontractId") as string,
      periodStart:       fd.get("periodStart") as string,
      periodEnd:         fd.get("periodEnd") as string,
      certificationDate: fd.get("certificationDate") as string,
      notes:             (fd.get("notes") as string) || null,
      replacesCertificationId:
        typeof replacesRaw === "string" && replacesRaw.trim()
          ? replacesRaw.trim()
          : null,
      lines,
    };
    const parsed = createSubcontractCertificationSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    const result = await createSubcontractCertification(parsed.data, ctx);
    revalidatePath(`/proyectos`);
    revalidateProjectCostAndFinancePaths(result.projectId);
    return { id: result.id };
  } catch (err) { return handle(err); }
}

export async function updateSubcontractCertificationAction(
  id: string,
  fd: FormData,
): Promise<{ error: string } | { ok: true }> {
  try {
    const ctx = await getCtx();
    const linesRaw = fd.get("lines");
    let lines: unknown | undefined;
    if (linesRaw) {
      const linesParsed = parseLinesJson(linesRaw, "Datos inválidos en líneas de certificación");
      if ("error" in linesParsed) return linesParsed;
      lines = linesParsed.lines;
    }
    const raw = {
      periodStart:       (fd.get("periodStart") as string) || undefined,
      periodEnd:         (fd.get("periodEnd") as string) || undefined,
      certificationDate: (fd.get("certificationDate") as string) || undefined,
      notes:             (fd.get("notes") as string) || null,
      lines,
    };
    const parsed = updateSubcontractCertificationSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    const result = await updateSubcontractCertification(id, parsed.data, ctx);
    revalidatePath(`/proyectos`);
    revalidateProjectCostAndFinancePaths(result.projectId);
    return { ok: true };
  } catch (err) { return handle(err); }
}

export async function issueSubcontractCertificationAction(
  id: string,
  subcontractId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getCtx();
    await issueSubcontractCertification(id, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function approveSubcontractCertificationAction(
  id: string,
  subcontractId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getCtx();
    await approveSubcontractCertification(id, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function rejectSubcontractCertificationAction(
  id: string,
  subcontractId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getCtx();
    await rejectSubcontractCertification(id, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelSubcontractCertificationAction(
  id: string,
  subcontractId: string,
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getCtx();
    await cancelSubcontractCertification(id, ctx);
    revalidatePath(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
    revalidateProjectCostAndFinancePaths(projectId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
