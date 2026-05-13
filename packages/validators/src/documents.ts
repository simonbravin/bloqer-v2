import { z } from "zod";

const DOCUMENT_CATEGORIES = [
  "CONTRACT", "PLAN", "PERMIT", "TECHNICAL", "PHOTO",
  "INVOICE", "RECEIPT", "CERTIFICATE", "REPORT", "JOBSITE_EVIDENCE", "OTHER",
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
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

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
    /** Required for project-scoped entities; omit/null only for corporate supplier invoices (see document.service). */
    projectId:        z.string().uuid().optional().nullable(),
    originalFileName: z.string().min(1, "Nombre de archivo requerido").max(500),
    mimeType:         z.enum(ALLOWED_MIME_TYPES, {
      errorMap: () => ({ message: "Tipo de archivo no permitido" }),
    }),
    sizeBytes:        z.coerce.number().int().min(1).max(MAX_SIZE_BYTES, "El archivo no puede superar 50 MB"),
    category:         z.enum(DOCUMENT_CATEGORIES).default("OTHER"),
    description:      z.string().max(1000).optional().nullable(),
    /** When set with linkedEntityId, attachment is bound to this entity (server validates ownership). */
    linkedEntityType: z
      .enum([
        "JOBSITE_LOG",
        "CERTIFICATION",
        "SUPPLIER_INVOICE",
        "PURCHASE_ORDER",
        "PURCHASE_RECEIPT",
        "SUBCONTRACT",
        "SUBCONTRACT_CERTIFICATION",
        "BUDGET",
      ])
      .optional(),
    linkedEntityId:   z.string().uuid().optional(),
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
    if (!hasProject && data.linkedEntityType && data.linkedEntityType !== "SUPPLIER_INVOICE") {
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
});

export type CreateDocumentMetadataInput = z.infer<typeof createDocumentMetadataSchema>;
export type InitiateUploadInput         = z.infer<typeof initiateUploadSchema>;
export type ListProjectDocumentsInput   = z.infer<typeof listProjectDocumentsSchema>;
