"use client";
import { formatDate } from "@/lib/format";

import Link from "next/link";
import type { DocumentAttachmentView } from "@bloqer/services";
import { DocumentCategoryBadge } from "./document-category-badge";
import { DocumentStatusBadge } from "./document-status-badge";
import { DocumentForm } from "./document-form";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  archiveDocumentAction,
  restoreDocumentAction,
  softDeleteDocumentAction,
} from "@/app/(app)/proyectos/[id]/documentos/actions";
import {
  archiveCompanyFinanzasAttachmentAction,
  restoreCompanyFinanzasAttachmentAction,
  softDeleteCompanyFinanzasAttachmentAction,
} from "@/app/(app)/finanzas/facturas-proveedor/attachment-actions";

function fmtDate(iso: string) {
  return formatDate(iso);
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

export type EntityDocumentsPanelScope =
  | { kind: "project"; projectId: string }
  | { kind: "company-finanzas-supplier-invoice" };

interface PanelPaths {
  revalidateExtra: string[];
  afterUploadPath: string;
  cancelHref:      string;
  emptyMessage:    string;
  defaultCategory: string;
  uploadHint:      string | null;
}

function getPanelPaths(scope: EntityDocumentsPanelScope, linkedEntity: EntityDocumentsLink): PanelPaths {
  if (scope.kind === "company-finanzas-supplier-invoice") {
    if (linkedEntity.type !== "SUPPLIER_INVOICE") {
      throw new Error("EntityDocumentsPanel: alcance empresa solo admite facturas de proveedor");
    }
    const p = `/finanzas/facturas-proveedor/${linkedEntity.id}`;
    return {
      revalidateExtra: [p],
      afterUploadPath: p,
      cancelHref:      p,
      emptyMessage:    "No hay adjuntos en esta factura de proveedor.",
      defaultCategory: "INVOICE",
      uploadHint:      "Factura, remito o comprobante",
    };
  }

  const projectId = scope.projectId;

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
  scope:             EntityDocumentsPanelScope;
  linkedEntity:      EntityDocumentsLink;
  storageConfigured: boolean;
  docs:              DocumentAttachmentView[];
  canEdit:           boolean;
}

export function EntityDocumentsPanel({
  scope,
  linkedEntity,
  storageConfigured,
  docs,
  canEdit,
}: Props) {
  const { revalidateExtra, afterUploadPath, cancelHref, emptyMessage, defaultCategory, uploadHint } =
    getPanelPaths(scope, linkedEntity);

  const isCompany = scope.kind === "company-finanzas-supplier-invoice";
  const projectIdForForm = scope.kind === "project" ? scope.projectId : null;
  const projectIdForTable = scope.kind === "project" ? scope.projectId : null;

  const subtitle = isCompany
    ? "Adjuntos de la factura corporativa (sin proyecto). Podés descargar desde acá; no hay biblioteca de proyecto vinculada."
    : "También aparecen en la biblioteca de documentos del proyecto.";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Adjuntos</h2>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {docs.length === 0 ? (
          <ListEmptyState message={emptyMessage} />
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tamaño</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const canDownload =
                    doc.storageProvider === "R2" &&
                    (doc.status === "ACTIVE" || doc.status === "ARCHIVED");
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        {projectIdForTable ? (
                          <Link
                            href={`/proyectos/${projectIdForTable}/documentos/${doc.id}`}
                            className="font-medium hover:underline underline-offset-2"
                          >
                            {doc.originalFileName}
                          </Link>
                        ) : (
                          <span className="font-medium">{doc.originalFileName}</span>
                        )}
                        {doc.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                            {doc.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <DocumentCategoryBadge category={doc.category} />
                      </TableCell>
                      <TableCell>
                        <DocumentStatusBadge status={doc.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">
                        {fmtSize(doc.sizeBytes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {fmtDate(doc.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {canDownload && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/api/documents/${doc.id}/download`}>Descargar</a>
                            </Button>
                          )}
                          {doc.canMutate && doc.status === "ACTIVE" && isCompany && (
                            <form action={archiveCompanyFinanzasAttachmentAction.bind(null, doc.id, revalidateExtra)}>
                              <Button variant="ghost" size="sm" type="submit">
                                Archivar
                              </Button>
                            </form>
                          )}
                          {doc.canMutate && doc.status === "ACTIVE" && !isCompany && projectIdForTable && (
                            <form action={archiveDocumentAction.bind(null, doc.id, projectIdForTable, revalidateExtra)}>
                              <Button variant="ghost" size="sm" type="submit">
                                Archivar
                              </Button>
                            </form>
                          )}
                          {doc.canMutate && doc.status === "ARCHIVED" && isCompany && (
                            <form action={restoreCompanyFinanzasAttachmentAction.bind(null, doc.id, revalidateExtra)}>
                              <Button variant="ghost" size="sm" type="submit">
                                Restaurar
                              </Button>
                            </form>
                          )}
                          {doc.canMutate && doc.status === "ARCHIVED" && !isCompany && projectIdForTable && (
                            <form action={restoreDocumentAction.bind(null, doc.id, projectIdForTable, revalidateExtra)}>
                              <Button variant="ghost" size="sm" type="submit">
                                Restaurar
                              </Button>
                            </form>
                          )}
                          {doc.canMutate && doc.status !== "DELETED" && doc.status !== "UPLOADING" && isCompany && (
                            <form action={softDeleteCompanyFinanzasAttachmentAction.bind(null, doc.id, revalidateExtra)}>
                              <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                                Eliminar
                              </Button>
                            </form>
                          )}
                          {doc.canMutate && doc.status !== "DELETED" && doc.status !== "UPLOADING" && !isCompany && projectIdForTable && (
                            <form
                              action={softDeleteDocumentAction.bind(null, doc.id, projectIdForTable, {
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableScroll>
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
            projectId={projectIdForForm}
            storageConfigured={storageConfigured}
            linkedEntity={linkedEntity}
            defaultCategory={defaultCategory}
            afterUploadPath={afterUploadPath}
            cancelHref={cancelHref}
            revalidatePaths={[afterUploadPath, ...revalidateExtra]}
            submitLabel="Subir adjunto"
            placeholderWarning="La carga real de archivos no está configurada en este entorno. Solo se guardará la metadata (modo desarrollo)."
          />
        </div>
      )}
    </div>
  );
}
