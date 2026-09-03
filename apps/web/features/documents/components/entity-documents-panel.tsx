"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import type { DocumentAttachmentView } from "@bloqer/services";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocumentCategoryBadge } from "./document-category-badge";
import { DocumentStatusBadge } from "./document-status-badge";
import { DocumentStorageBadge } from "./document-storage-badge";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { DocumentFileActions } from "./document-file-actions";
import { DocumentMutateIconActions } from "./document-mutate-icon-actions";
import {
  canAccessDocumentFile,
  isImageLikeDocument,
} from "../lib/document-file-utils";
import { DocumentThumbnail } from "./document-thumbnail";
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

type AttachmentMutations = {
  onArchive?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onDelete?: () => Promise<void>;
};

function getAttachmentMutations(
  doc: DocumentAttachmentView,
  opts: { isCompany: boolean; projectId: string | null; revalidateExtra: string[] },
): AttachmentMutations {
  if (!doc.canMutate) return {};
  const { isCompany, projectId, revalidateExtra } = opts;
  const cancelUpload =
    doc.status === "UPLOADING"
      ? isCompany
        ? () => softDeleteCompanyFinanzasAttachmentAction(doc.id, revalidateExtra)
        : projectId
          ? () =>
              softDeleteDocumentAction(doc.id, projectId, {
                extraPathsToRevalidate: revalidateExtra,
                redirectToProjectDocuments: false,
              })
          : undefined
      : undefined;
  if (isCompany) {
    return {
      onArchive: () => archiveCompanyFinanzasAttachmentAction(doc.id, revalidateExtra),
      onRestore: () => restoreCompanyFinanzasAttachmentAction(doc.id, revalidateExtra),
      onDelete: cancelUpload,
    };
  }
  if (!projectId) return {};
  return {
    onArchive: () => archiveDocumentAction(doc.id, projectId, revalidateExtra),
    onRestore: () => restoreDocumentAction(doc.id, projectId, revalidateExtra),
    onDelete: cancelUpload,
  };
}

function AttachmentActionsRow({
  doc,
  mutations,
  className,
}: {
  doc: DocumentAttachmentView;
  mutations: AttachmentMutations;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-nowrap items-center justify-end gap-0.5", className)}>
      <DocumentFileActions
        documentId={doc.id}
        mimeType={doc.mimeType}
        originalFileName={doc.originalFileName}
        storageProvider={doc.storageProvider}
        status={doc.status}
      />
      <DocumentMutateIconActions
        fileName={doc.originalFileName}
        status={doc.status}
        canMutate={doc.canMutate}
        canDelete={doc.canDelete}
        onArchive={mutations.onArchive}
        onRestore={mutations.onRestore}
        onDelete={mutations.onDelete}
      />
    </div>
  );
}

function EntityDocumentMobileList({
  docs,
  projectId,
  emptyMessage,
  mutationOpts,
}: {
  docs: DocumentAttachmentView[];
  projectId: string | null;
  emptyMessage: string;
  mutationOpts: { isCompany: boolean; projectId: string | null; revalidateExtra: string[] };
}) {
  if (docs.length === 0) {
    return <ListEmptyState message={emptyMessage} />;
  }
  return (
    <ul className="space-y-2 md:hidden">
      {docs.map((doc) => {
        const href = projectId ? `/proyectos/${projectId}/documentos/${doc.id}` : undefined;
        const showThumb =
          canAccessDocumentFile(doc) &&
          isImageLikeDocument(doc.mimeType, doc.originalFileName);

        return (
          <li key={doc.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-3">
              {showThumb ? (
                <DocumentThumbnail documentId={doc.id} />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {href ? (
                  <Link
                    href={href}
                    className="block truncate text-sm font-medium hover:underline underline-offset-2"
                  >
                    {doc.originalFileName}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium">{doc.originalFileName}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <DocumentCategoryBadge category={doc.category} />
                </div>
              </div>
            </div>
            <AttachmentActionsRow
              doc={doc}
              mutations={getAttachmentMutations(doc, mutationOpts)}
              className="justify-start"
            />
          </li>
        );
      })}
    </ul>
  );
}

export type EntityDocumentsLink =
  | { type: "JOBSITE_LOG"; id: string }
  | { type: "CERTIFICATION"; id: string }
  | { type: "SUPPLIER_INVOICE"; id: string }
  | { type: "SALES_INVOICE"; id: string }
  | { type: "PURCHASE_ORDER"; id: string }
  | { type: "PURCHASE_RECEIPT"; id: string }
  | { type: "PURCHASE_REQUEST"; id: string }
  | { type: "PROCUREMENT_QUOTE"; id: string }
  | { type: "SUBCONTRACT"; id: string }
  | { type: "SUBCONTRACT_CERTIFICATION"; id: string; subcontractId: string }
  | { type: "BUDGET"; id: string };

export type EntityDocumentsPanelScope =
  | { kind: "project"; projectId: string }
  /** Corporate Finanzas attachments (AP supplier invoice or AR sales invoice / CxC detail). */
  | { kind: "company-finanzas"; afterUploadPath: string };

interface PanelPaths {
  revalidateExtra: string[];
  afterUploadPath: string;
  emptyMessage: string;
  defaultCategory: string;
  uploadHint: string | null;
}

function getPanelPaths(scope: EntityDocumentsPanelScope, linkedEntity: EntityDocumentsLink): PanelPaths {
  if (scope.kind === "company-finanzas") {
    if (linkedEntity.type !== "SUPPLIER_INVOICE" && linkedEntity.type !== "SALES_INVOICE") {
      throw new Error("EntityDocumentsPanel: alcance empresa solo admite facturas AP/AR");
    }
    const p = scope.afterUploadPath;
    const isSales = linkedEntity.type === "SALES_INVOICE";
    return {
      revalidateExtra: [p],
      afterUploadPath: p,
      emptyMessage: isSales
        ? "No hay adjuntos en esta factura de venta."
        : "No hay adjuntos en esta factura de proveedor.",
      defaultCategory: "INVOICE",
      uploadHint: isSales
        ? "Copia digital o foto de la factura"
        : "Factura, remito o comprobante",
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
    case "SALES_INVOICE": {
      const p = `/proyectos/${projectId}/facturas/${linkedEntity.id}`;
      return {
        revalidateExtra: [p],
        afterUploadPath: p,
        emptyMessage: "No hay adjuntos en esta factura de venta.",
        defaultCategory: "INVOICE",
        uploadHint: "Copia digital o foto de la factura",
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

  const isCompany = scope.kind === "company-finanzas";
  const projectIdForForm = scope.kind === "project" ? scope.projectId : null;
  const projectIdForTable = scope.kind === "project" ? scope.projectId : null;

  const subtitle = isCompany
    ? "Adjuntos del comprobante corporativo."
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
            placeholderWarning="El almacenamiento de archivos no está configurado en este entorno. Solo se guardará la metadata; no habrá un archivo descargable."
          />
        )}
      </div>

      {!storageConfigured ? (
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/10 dark:text-amber-300"
        >
          Almacenamiento no configurado: las nuevas subidas quedarán como{" "}
          <strong>Archivo no almacenado</strong> (solo metadata).
        </div>
      ) : null}

      {docs.length === 0 ? (
        <ListEmptyState message={emptyMessage} />
      ) : (
        <>
          <EntityDocumentMobileList
            docs={docs}
            projectId={projectIdForTable}
            emptyMessage={emptyMessage}
            mutationOpts={{ isCompany, projectId: projectIdForTable, revalidateExtra }}
          />
        <TableScroll className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-9">Archivo</TableHead>
                <TableHead className="h-9">Categoría</TableHead>
                <TableHead className="h-9">Estado</TableHead>
                <TableHead className="h-9">Tamaño</TableHead>
                <TableHead className="h-9">Fecha</TableHead>
                <TableHead className="h-9 w-px text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => {
                const mutations = getAttachmentMutations(doc, {
                  isCompany,
                  projectId: projectIdForTable,
                  revalidateExtra,
                });
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="py-1.5">
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
                    <TableCell className="py-1.5">
                      <DocumentCategoryBadge category={doc.category} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DocumentStatusBadge status={doc.status} />
                        <DocumentStorageBadge storageProvider={doc.storageProvider} />
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">
                      {fmtSize(doc.sizeBytes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                      {fmtDate(doc.createdAt)}
                    </TableCell>
                    <TableCell className="w-px py-1.5 text-right">
                      <AttachmentActionsRow doc={doc} mutations={mutations} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableScroll>
        </>
      )}
    </div>
  );
}
