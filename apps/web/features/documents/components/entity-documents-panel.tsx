"use client";
import { formatDate } from "@/lib/format";

import Link from "next/link";
import type { DocumentAttachmentView } from "@bloqer/services";
import { DocumentCategoryBadge } from "./document-category-badge";
import { DocumentStatusBadge } from "./document-status-badge";
import { DocumentUploadDialog } from "./document-upload-dialog";
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
  | { type: "PURCHASE_REQUEST"; id: string }
  | { type: "PROCUREMENT_QUOTE"; id: string }
  | { type: "SUBCONTRACT"; id: string }
  | { type: "SUBCONTRACT_CERTIFICATION"; id: string; subcontractId: string }
  | { type: "BUDGET"; id: string };

export type EntityDocumentsPanelScope =
  | { kind: "project"; projectId: string }
  | { kind: "company-finanzas-supplier-invoice" };

interface PanelPaths {
  revalidateExtra: string[];
  afterUploadPath: string;
  emptyMessage: string;
  defaultCategory: string;
  uploadHint: string | null;
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
      emptyMessage: "No hay adjuntos en esta factura de proveedor.",
      defaultCategory: "INVOICE",
      uploadHint: "Factura, remito o comprobante",
    };
  }

  const projectId = scope.projectId;

  switch (linkedEntity.type) {
    case "JOBSITE_LOG": {
      const p = `/proyectos/${projectId}/libro-obra/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en este parte.",
        defaultCategory: "JOBSITE_EVIDENCE",
        uploadHint: "Fotos, planos o evidencia del parte de obra",
      };
    }
    case "CERTIFICATION": {
      const p = `/proyectos/${projectId}/certificaciones/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta certificación.",
        defaultCategory: "CERTIFICATE",
        uploadHint: "Soporte de certificación",
      };
    }
    case "SUPPLIER_INVOICE": {
      const p = `/proyectos/${projectId}/facturas-proveedor/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta factura de proveedor.",
        defaultCategory: "INVOICE",
        uploadHint: "Factura, remito o comprobante",
      };
    }
    case "PURCHASE_ORDER": {
      const p = `/proyectos/${projectId}/ordenes-compra/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta orden de compra.",
        defaultCategory: "CONTRACT",
        uploadHint: "OC o documentación de compra",
      };
    }
    case "PURCHASE_RECEIPT": {
      const p = `/proyectos/${projectId}/recepciones/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta recepción.",
        defaultCategory: "RECEIPT",
        uploadHint: "Remito o evidencia de recepción",
      };
    }
    case "PURCHASE_REQUEST": {
      const p = `/proyectos/${projectId}/solicitudes-compra/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta solicitud.",
        defaultCategory: "OTHER",
        uploadHint: "Especificación, plano o detalle del pedido",
      };
    }
    case "PROCUREMENT_QUOTE": {
      const p = `/proyectos/${projectId}/solicitudes-compra`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta cotización.",
        defaultCategory: "INVOICE",
        uploadHint: "Presupuesto o cotización del proveedor",
      };
    }
    case "SUBCONTRACT": {
      const p = `/proyectos/${projectId}/subcontratos/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en este subcontrato.",
        defaultCategory: "CONTRACT",
        uploadHint: "Contrato o documentación del subcontrato",
      };
    }
    case "SUBCONTRACT_CERTIFICATION": {
      const p = `/proyectos/${projectId}/subcontratos/${linkedEntity.subcontractId}/certificaciones/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta certificación de subcontrato.",
        defaultCategory: "CERTIFICATE",
        uploadHint: "Certificado o respaldo de mediciones",
      };
    }
    case "BUDGET": {
      const p = `/proyectos/${projectId}/presupuestos/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en este presupuesto.",
        defaultCategory: "REPORT",
        uploadHint: "Informe de costos, exportaciones o respaldo del presupuesto",
      };
    }
  }
}

interface Props {
  scope: EntityDocumentsPanelScope;
  linkedEntity: EntityDocumentsLink;
  storageConfigured: boolean;
  docs: DocumentAttachmentView[];
  canEdit: boolean;
}

export function EntityDocumentsPanel({
  scope,
  linkedEntity,
  storageConfigured,
  docs,
  canEdit,
}: Props) {
  const { revalidateExtra, afterUploadPath, emptyMessage, defaultCategory, uploadHint } =
    getPanelPaths(scope, linkedEntity);

  const isCompany = scope.kind === "company-finanzas-supplier-invoice";
  const projectIdForForm = scope.kind === "project" ? scope.projectId : null;
  const projectIdForTable = scope.kind === "project" ? scope.projectId : null;

  const subtitle = isCompany
    ? "Adjuntos de la factura corporativa."
    : "También visibles en la biblioteca de documentos del proyecto.";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Adjuntos</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {canEdit && (
          <DocumentUploadDialog
            projectId={projectIdForForm}
            storageConfigured={storageConfigured}
            linkedEntity={linkedEntity}
            defaultCategory={defaultCategory}
            afterUploadPath={afterUploadPath}
            revalidatePaths={revalidateExtra}
            triggerLabel="Adjuntar"
            title="Adjuntar archivo"
            description={uploadHint ?? undefined}
            submitLabel="Subir adjunto"
            placeholderWarning="La carga real de archivos no está configurada en este entorno. Solo se guardará la metadata (modo desarrollo)."
          />
        )}
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
                        <p className="mt-0.5 max-w-[200px] truncate text-xs text-muted-foreground">
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
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {fmtSize(doc.sizeBytes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
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
                        {doc.canMutate && doc.status === "UPLOADING" && isCompany && (
                          <form action={softDeleteCompanyFinanzasAttachmentAction.bind(null, doc.id, revalidateExtra)}>
                            <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                              Cancelar subida
                            </Button>
                          </form>
                        )}
                        {doc.canMutate && doc.status === "UPLOADING" && !isCompany && projectIdForTable && (
                          <form
                            action={softDeleteDocumentAction.bind(null, doc.id, projectIdForTable, {
                              extraPathsToRevalidate: revalidateExtra,
                              redirectToProjectDocuments: false,
                            })}
                          >
                            <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                              Cancelar subida
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
  );
}
