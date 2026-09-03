import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentById, ServiceError } from "@bloqer/services";
import {
  DocumentCategoryBadge,
  DocumentStatusBadge,
  DocumentStorageBadge,
  DocumentLibraryActions,
  DocumentInlineImagePreview,
} from "@/features/documents";
import {
  canInlineImagePreview,
  canAccessDocumentFile,
} from "@/features/documents/lib/document-file-utils";
import { linkedEntityTypeLabelEs } from "@/features/documents/lib/linked-entity-label";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string; documentId: string }>;
}

function fmtDate(iso: string) {
  return formatDate(iso);
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentoDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, documentId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let doc;
  try {
    doc = await getDocumentById(documentId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (doc.projectId !== id) notFound();
  if (doc.status === "DELETED") notFound();

  const canAccess = canAccessDocumentFile(doc);
  const showInlineImage =
    canAccess && canInlineImagePreview(doc.mimeType, doc.originalFileName);

  const linkedLabel = linkedEntityTypeLabelEs(doc.linkedEntityType);

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={doc.originalFileName}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="max-w-md truncate text-xl font-bold tracking-tight">
            {doc.originalFileName}
          </h1>
          <DocumentStorageBadge storageProvider={doc.storageProvider} />
        </div>
        <DocumentLibraryActions doc={doc} projectId={id} redirectAfterDelete />
      </div>

      {doc.canMutate &&
      linkedLabel &&
      !doc.canDelete &&
      doc.status !== "UPLOADING" ? (
        <div
          role="note"
          className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          Este archivo está ligado a {linkedLabel}: no se puede eliminar (es respaldo). Si no
          querés verlo en la lista, archiválo.
        </div>
      ) : null}

      {doc.status === "UPLOADING" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Esta subida quedó incompleta (por ejemplo, por un error de red). Podés cancelarla con el botón
          de arriba o recargar la página; las subidas abandonadas se limpian solas al poco tiempo.
        </div>
      )}

      {doc.storageProvider === "PLACEHOLDER" &&
        (doc.status === "ACTIVE" || doc.status === "ARCHIVED") && (
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 space-y-1"
        >
          <p className="font-medium">Archivo no almacenado</p>
          <p>
            Solo se guardó la metadata de este documento. No hay un archivo descargable en el
            almacenamiento. Esto ocurre cuando el almacenamiento de archivos no estaba configurado
            al momento de la subida.
          </p>
        </div>
      )}

      {showInlineImage ? (
        <DocumentInlineImagePreview
          documentId={documentId}
          originalFileName={doc.originalFileName}
        />
      ) : null}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Información del documento</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Nombre original</dt>
            <dd className="font-medium break-all">{doc.originalFileName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Estado</dt>
            <dd>
              <DocumentStatusBadge status={doc.status} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Categoría</dt>
            <dd>
              <DocumentCategoryBadge category={doc.category} />
            </dd>
          </div>
          {linkedLabel ? (
            <div>
              <dt className="text-muted-foreground">Vinculado a</dt>
              <dd className="font-medium">{linkedLabel}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">Tipo MIME</dt>
            <dd className="font-mono text-xs">{doc.mimeType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tamaño</dt>
            <dd className="font-medium">{fmtSize(doc.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Almacenamiento</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{doc.storageProvider}</span>
              <DocumentStorageBadge storageProvider={doc.storageProvider} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Subido por</dt>
            <dd className="font-mono text-xs text-muted-foreground">{doc.uploadedBy}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fecha de creación</dt>
            <dd className="font-medium">{fmtDate(doc.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Última actualización</dt>
            <dd className="font-medium">{fmtDate(doc.updatedAt)}</dd>
          </div>
          {doc.description && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Descripción</dt>
              <dd className="whitespace-pre-wrap font-medium">{doc.description}</dd>
            </div>
          )}
        </dl>
      </div>
    </PageShell>
  );
}
