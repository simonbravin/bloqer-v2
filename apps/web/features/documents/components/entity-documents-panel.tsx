"use client";

import Link from "next/link";
import type { DocumentAttachmentView } from "@bloqer/services";
import { DocumentCategoryBadge } from "./document-category-badge";
import { DocumentStatusBadge } from "./document-status-badge";
import { DocumentForm } from "./document-form";
import { Button } from "@/components/ui/button";
import {
  archiveDocumentAction,
  restoreDocumentAction,
  softDeleteDocumentAction,
} from "@/app/(app)/proyectos/[id]/documentos/actions";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR");
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type EntityDocumentsLink =
  | { type: "JOBSITE_LOG"; id: string }
  | { type: "CERTIFICATION"; id: string }
  | { type: "SUPPLIER_INVOICE"; id: string }
  | { type: "PURCHASE_ORDER"; id: string }
  | { type: "PURCHASE_RECEIPT"; id: string }
  | { type: "SUBCONTRACT"; id: string }
  | { type: "SUBCONTRACT_CERTIFICATION"; id: string; subcontractId: string }
  | { type: "BUDGET"; id: string };

interface PanelPaths {
  revalidateExtra: string[];
  afterUploadPath: string;
  cancelHref:      string;
  emptyMessage:    string;
  defaultCategory: string;
  uploadHint:      string | null;
}

function getPanelPaths(projectId: string, linkedEntity: EntityDocumentsLink): PanelPaths {
  switch (linkedEntity.type) {
    case "JOBSITE_LOG": {
      const p = `/proyectos/${projectId}/libro-obra/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en este parte.",
        defaultCategory: "JOBSITE_EVIDENCE",
        uploadHint:      null,
      };
    }
    case "CERTIFICATION": {
      const p = `/proyectos/${projectId}/certificaciones/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en esta certificación.",
        defaultCategory: "CERTIFICATE",
        uploadHint:      "Soporte de certificación",
      };
    }
    case "SUPPLIER_INVOICE": {
      const p = `/proyectos/${projectId}/facturas-proveedor/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en esta factura de proveedor.",
        defaultCategory: "INVOICE",
        uploadHint:      "Factura, remito o comprobante",
      };
    }
    case "PURCHASE_ORDER": {
      const p = `/proyectos/${projectId}/ordenes-compra/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en esta orden de compra.",
        defaultCategory: "CONTRACT",
        uploadHint:      "OC o documentación de compra",
      };
    }
    case "PURCHASE_RECEIPT": {
      const p = `/proyectos/${projectId}/recepciones/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en esta recepción.",
        defaultCategory: "RECEIPT",
        uploadHint:      "Remito o evidencia de recepción",
      };
    }
    case "SUBCONTRACT": {
      const p = `/proyectos/${projectId}/subcontratos/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en este subcontrato.",
        defaultCategory: "CONTRACT",
        uploadHint:      "Contrato o documentación del subcontrato",
      };
    }
    case "SUBCONTRACT_CERTIFICATION": {
      const p = `/proyectos/${projectId}/subcontratos/${linkedEntity.subcontractId}/certificaciones/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en esta certificación de subcontrato.",
        defaultCategory: "CERTIFICATE",
        uploadHint:      "Certificado o respaldo de mediciones",
      };
    }
    case "BUDGET": {
      const p = `/proyectos/${projectId}/presupuestos/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        cancelHref:      p,
        emptyMessage:    "No hay adjuntos en este presupuesto.",
        defaultCategory: "REPORT",
        uploadHint:      "Informe de costos, exportaciones o respaldo del presupuesto",
      };
    }
  }
}

interface Props {
  projectId:         string;
  linkedEntity:      EntityDocumentsLink;
  storageConfigured: boolean;
  docs:              DocumentAttachmentView[];
  canEdit:           boolean;
}

export function EntityDocumentsPanel({
  projectId,
  linkedEntity,
  storageConfigured,
  docs,
  canEdit,
}: Props) {
  const { revalidateExtra, afterUploadPath, cancelHref, emptyMessage, defaultCategory, uploadHint } =
    getPanelPaths(projectId, linkedEntity);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Adjuntos</h2>
          <p className="text-xs text-muted-foreground mt-1">
            También aparecen en la biblioteca de documentos del proyecto.
          </p>
        </div>
        {docs.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            {emptyMessage}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Archivo</th>
                  <th className="px-4 py-2.5 text-left font-medium">Categoría</th>
                  <th className="px-4 py-2.5 text-left font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tamaño</th>
                  <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                  <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const canDownload =
                    doc.storageProvider === "R2" &&
                    (doc.status === "ACTIVE" || doc.status === "ARCHIVED");
                  return (
                    <tr key={doc.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/proyectos/${projectId}/documentos/${doc.id}`}
                          className="font-medium hover:underline underline-offset-2"
                        >
                          {doc.originalFileName}
                        </Link>
                        {doc.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                            {doc.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <DocumentCategoryBadge category={doc.category} />
                      </td>
                      <td className="px-4 py-2.5">
                        <DocumentStatusBadge status={doc.status} />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs tabular-nums">
                        {fmtSize(doc.sizeBytes)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                        {fmtDate(doc.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {canDownload && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/api/documents/${doc.id}/download`}>Descargar</a>
                            </Button>
                          )}
                          {doc.canMutate && doc.status === "ACTIVE" && (
                            <form action={archiveDocumentAction.bind(null, doc.id, projectId, revalidateExtra)}>
                              <Button variant="ghost" size="sm" type="submit">
                                Archivar
                              </Button>
                            </form>
                          )}
                          {doc.canMutate && doc.status === "ARCHIVED" && (
                            <form action={restoreDocumentAction.bind(null, doc.id, projectId, revalidateExtra)}>
                              <Button variant="ghost" size="sm" type="submit">
                                Restaurar
                              </Button>
                            </form>
                          )}
                          {doc.canMutate && doc.status !== "DELETED" && doc.status !== "UPLOADING" && (
                            <form
                              action={softDeleteDocumentAction.bind(null, doc.id, projectId, {
                                extraPathsToRevalidate: revalidateExtra,
                                redirectToProjectDocuments: false,
                              })}
                            >
                              <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                                Eliminar
                              </Button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="rounded-lg border bg-card p-6">
          <h3 className={`font-semibold ${uploadHint ? "mb-1" : "mb-4"}`}>
            Agregar adjunto
          </h3>
          {uploadHint && (
            <p className="text-xs text-muted-foreground mb-3">{uploadHint}</p>
          )}
          <DocumentForm
            projectId={projectId}
            storageConfigured={storageConfigured}
            linkedEntity={linkedEntity}
            defaultCategory={defaultCategory}
            afterUploadPath={afterUploadPath}
            cancelHref={cancelHref}
            submitLabel="Subir adjunto"
            placeholderWarning="La carga real de archivos no está configurada en este entorno. Solo se guardará la metadata (modo desarrollo)."
          />
        </div>
      )}
    </div>
  );
}
