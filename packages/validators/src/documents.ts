import { z } from "zod";
import { idempotencyKeySchema } from "./idempotency";

const DOCUMENT_CATEGORIES = [
  "CONTRACT", "PLAN", "PERMIT", "TECHNICAL", "PHOTO",
  "INVOICE", "RECEIPT", "CERTIFICATE", "REPORT", "JOBSITE_EVIDENCE",
  "BUDGET", "QUOTE", "OTHER",
] as const;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  /** AutoCAD Drawing — IANA `image/vnd.dwg`; browsers often send empty / octet-stream. */
  "image/vnd.dwg",
  /** AutoCAD DXF — IANA `image/vnd.dxf`. */
  "image/vnd.dxf",
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

/** Extra `accept` tokens for file inputs (MIME alone is unreliable for CAD). */
export const DOCUMENT_UPLOAD_EXTENSION_ACCEPT = [".dwg", ".dxf"] as const;

/** Value for `<input type="file" accept=…>` in Documentos / adjuntos. */
export const DOCUMENT_FILE_INPUT_ACCEPT = [
  ...ALLOWED_MIME_TYPES,
  ...DOCUMENT_UPLOAD_EXTENSION_ACCEPT,
].join(",");

const EXTENSION_MIME_MAP: Record<string, AllowedMimeType> = {
  pdf:  "application/pdf",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc:  "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:  "application/vnd.ms-excel",
  csv:  "text/csv",
  txt:  "text/plain",
  dwg:  "image/vnd.dwg",
  dxf:  "image/vnd.dxf",
};

/** Extensiones donde el MIME del browser suele ser vacío u `octet-stream`. */
const EXTENSION_PREFERRED = new Set(["dwg", "dxf"]);

/** MIME types safe to open with Content-Disposition: inline in a browser tab. */
export const INLINE_DOCUMENT_PREVIEW_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export function isInlineDocumentPreviewMime(mimeType: string): boolean {
  return (INLINE_DOCUMENT_PREVIEW_MIME_TYPES as readonly string[]).includes(
    mimeType.toLowerCase().trim(),
  );
}

/**
 * Canonical MIME for upload: extension wins for CAD; otherwise browser MIME if allowed.
 * Returns null when the pair is not on the allowlist.
 */
export function resolveAllowedMimeType(
  fileName:        string,
  browserMimeType?: string | null,
): AllowedMimeType | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext && EXTENSION_PREFERRED.has(ext) && ext in EXTENSION_MIME_MAP) {
    return EXTENSION_MIME_MAP[ext]!;
  }
  const browser = browserMimeType?.trim();
  if (browser && (ALLOWED_MIME_TYPES as readonly string[]).includes(browser)) {
    return browser as AllowedMimeType;
  }
  if (ext && ext in EXTENSION_MIME_MAP) {
    return EXTENSION_MIME_MAP[ext]!;
  }
  return null;
}

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const createDocumentMetadataSchema = z.object({
  projectId:        z.string().uuid(),
  originalFileName: z.string().min(1, "Nombre de archivo requerido").max(500),
  mimeType:         z.string().min(1, "Tipo de archivo requerido").max(200),
  sizeBytes:        z.coerce.number().int().min(0),
  category:         z.enum(DOCUMENT_CATEGORIES).default("OTHER"),
  description:      z.string().max(1000).optional().nullable(),
});

export const initiateUploadSchema = z
  .object({
    /** Required for project-scoped entities; omit/null for corporate SUPPLIER_INVOICE / SALES_INVOICE (see document.service). */
    projectId:        z.string().uuid().optional().nullable(),
    originalFileName: z.string().min(1, "Nombre de archivo requerido").max(500),
    mimeType:         z.enum(ALLOWED_MIME_TYPES, {
      errorMap: () => ({ message: "Tipo de archivo no permitido" }),
    }),
    sizeBytes:        z.coerce.number().int().min(1).max(MAX_SIZE_BYTES, "El archivo no puede superar 50 MB"),
    category:         z.enum(DOCUMENT_CATEGORIES).default("OTHER"),
    description:      z.string().max(1000).optional().nullable(),
    /** Library destination only ([D-113]); ignored/overridden for operational linkedEntityType. */
    folderId:         z.string().uuid().optional().nullable(),
    /** When set with linkedEntityId, attachment is bound to this entity (server validates ownership). */
    linkedEntityType: z
      .enum([
        "JOBSITE_LOG",
        "CERTIFICATION",
        "SUPPLIER_INVOICE",
        "SALES_INVOICE",
        "PURCHASE_ORDER",
        "PURCHASE_RECEIPT",
        "PURCHASE_REQUEST",
        "PROCUREMENT_QUOTE",
        "SUBCONTRACT",
        "SUBCONTRACT_CERTIFICATION",
        "BUDGET",
      ])
      .optional(),
    linkedEntityId:   z.string().uuid().optional(),
    idempotencyKey:   idempotencyKeySchema,
  })
  .superRefine((data, ctx) => {
    if (data.linkedEntityType && !data.linkedEntityId) {
      ctx.addIssue({
        code:    "custom",
        message: "Identificador de entidad vinculada requerido",
        path:    ["linkedEntityId"],
      });
    }
    if (data.linkedEntityId && !data.linkedEntityType) {
      ctx.addIssue({
        code:    "custom",
        message: "Tipo de entidad vinculada requerido",
        path:    ["linkedEntityType"],
      });
    }
    const hasProject = data.projectId != null && data.projectId !== "";
    const corporateWithoutProject =
      data.linkedEntityType === "SUPPLIER_INVOICE" || data.linkedEntityType === "SALES_INVOICE";
    if (!hasProject && data.linkedEntityType && !corporateWithoutProject) {
      ctx.addIssue({
        code:    "custom",
        message: "Proyecto requerido para este tipo de adjunto",
        path:    ["projectId"],
      });
    }
  });

export const listProjectDocumentsSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  status:   z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  search:   z.string().max(200).optional(),
  /** When set, only docs in that folder. Omit for flat “Todos”. */
  folderId: z.string().uuid().optional(),
});

export const createDocumentFolderSchema = z.object({
  parentId:  z.string().uuid(),
  name:      z.string().trim().min(1, "Nombre requerido").max(120),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
});

export const renameDocumentFolderSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(120),
});

export const moveDocumentFolderSchema = z.object({
  parentId: z.string().uuid(),
});

export const moveLibraryDocumentSchema = z.object({
  folderId: z.string().uuid(),
});

export type CreateDocumentMetadataInput = z.infer<typeof createDocumentMetadataSchema>;
export type InitiateUploadInput         = z.infer<typeof initiateUploadSchema>;
export type ListProjectDocumentsInput   = z.infer<typeof listProjectDocumentsSchema>;
export type CreateDocumentFolderInput   = z.infer<typeof createDocumentFolderSchema>;
export type RenameDocumentFolderInput   = z.infer<typeof renameDocumentFolderSchema>;
export type MoveDocumentFolderInput     = z.infer<typeof moveDocumentFolderSchema>;
export type MoveLibraryDocumentInput    = z.infer<typeof moveLibraryDocumentSchema>;
