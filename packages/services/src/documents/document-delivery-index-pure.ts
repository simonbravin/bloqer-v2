import type { DocumentAttachment } from "@bloqer/database";

export type DeliveryDocumentSource = Pick<DocumentAttachment,
  "id" | "tenantId" | "companyId" | "projectId" | "originalFileName" | "category" |
  "status" | "storageProvider" | "sizeBytes" | "uploadedBy" | "createdAt" |
  "linkedEntityType" | "linkedEntityId" | "replacesAttachmentId"
> & { effectiveCompanyId: string | null };

export type DocumentDeliveryRow = {
  id: string;
  companyId: string | null;
  fileName: string;
  category: string;
  categoryLabel: string;
  status: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  originalRegistered: boolean;
  sizeBytes: number;
  linkedEntityType: string;
  linkedEntityId: string | null;
  previous: { id: string; fileName: string } | null;
  next: { id: string; fileName: string } | null;
  href: string;
};

function sameRevisionScope(a: DeliveryDocumentSource, b: DeliveryDocumentSource): boolean {
  return a.tenantId === b.tenantId && a.projectId === b.projectId &&
    a.effectiveCompanyId === b.effectiveCompanyId &&
    (a.linkedEntityType ?? "PROJECT") === (b.linkedEntityType ?? "PROJECT") &&
    (a.linkedEntityId ?? a.projectId) === (b.linkedEntityId ?? b.projectId);
}

/** Inputs have already passed project, parent-module and company authorization. */
export function buildDocumentDeliveryRows(
  documents: DeliveryDocumentSource[],
  adjacent: DeliveryDocumentSource[],
  names: ReadonlyMap<string, string>,
): DocumentDeliveryRow[] {
  const all = new Map([...documents, ...adjacent].map((doc) => [doc.id, doc]));
  const nextById = new Map<string, DeliveryDocumentSource[]>();
  for (const doc of all.values()) {
    if (doc.replacesAttachmentId) {
      const group = nextById.get(doc.replacesAttachmentId) ?? [];
      group.push(doc);
      nextById.set(doc.replacesAttachmentId, group);
    }
  }
  return documents.map((doc) => {
    const previous = doc.replacesAttachmentId ? all.get(doc.replacesAttachmentId) : undefined;
    const successors = (nextById.get(doc.id) ?? []).filter((next) => sameRevisionScope(doc, next));
    const next = successors.length === 1 ? successors[0] : undefined;
    return {
      id: doc.id, companyId: doc.effectiveCompanyId, fileName: doc.originalFileName,
      category: doc.category, categoryLabel: DOCUMENT_DELIVERY_CATEGORY_LABELS[doc.category] ?? doc.category, status: doc.status, uploadedBy: doc.uploadedBy,
      uploadedByName: names.get(doc.uploadedBy) ?? "Usuario desconocido",
      createdAt: doc.createdAt.toISOString(),
      originalRegistered: doc.storageProvider === "R2" && ["ACTIVE", "ARCHIVED"].includes(doc.status),
      sizeBytes: doc.sizeBytes,
      linkedEntityType: doc.linkedEntityType ?? "PROJECT", linkedEntityId: doc.linkedEntityId ?? doc.projectId,
      previous: previous && sameRevisionScope(doc, previous) ? { id: previous.id, fileName: previous.originalFileName } : null,
      next: next ? { id: next.id, fileName: next.originalFileName } : null,
      href: `/proyectos/${doc.projectId}/documentos/${doc.id}`,
    };
  });
}

export const DOCUMENT_DELIVERY_CATEGORY_LABELS: Record<string, string> = {
  CONTRACT: "Contrato", PLAN: "Plano", PERMIT: "Permiso", TECHNICAL: "Técnico",
  PHOTO: "Foto", INVOICE: "Factura", RECEIPT: "Remito", CERTIFICATE: "Certificado",
  REPORT: "Informe", JOBSITE_EVIDENCE: "Evidencia obra", BUDGET: "Presupuesto", QUOTE: "Cotización", OTHER: "Otro",
};

export function documentDeliveryTable(rows: DocumentDeliveryRow[], projectId: string) {
  return {
    headers: ["Documento ID", "Archivo", "Categoría", "Estado", "Registrado por", "Usuario ID", "Fecha y hora UTC", "Original registrado", "Tamaño bytes", "Revisión anterior ID", "Revisión siguiente ID", "Empresa ID", "Proyecto ID", "Entidad", "Entidad ID", "Ruta en Bloqer"],
    rows: rows.map((row) => [row.id, row.fileName, row.categoryLabel,
      row.status === "ACTIVE" ? "Activo" : "Archivado", row.uploadedByName, row.uploadedBy, row.createdAt,
      row.originalRegistered ? "Sí" : "Sin original registrado", String(row.sizeBytes), row.previous?.id ?? "", row.next?.id ?? "",
      row.companyId ?? "Compartido", projectId, row.linkedEntityType, row.linkedEntityId ?? "", row.href]),
  };
}
