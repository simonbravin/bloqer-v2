import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentById, ServiceError } from "@bloqer/services";
import { DocumentCategoryBadge, DocumentStatusBadge, DocumentStorageBadge } from "@/features/documents";
import { PageShell } from "@/components/layout/page-shell";
import { archiveDocumentAction, restoreDocumentAction, softDeleteDocumentAction } from "../actions";
import { Button } from "@/components/ui/button";

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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const canDownload =
    doc.storageProvider === "R2" && (doc.status === "ACTIVE" || doc.status === "ARCHIVED");

  const doArchive = async () => {
    "use server";
    await archiveDocumentAction(documentId, id);
  };
  const doRestore = async () => {
    "use server";
    await restoreDocumentAction(documentId, id);
  };
  const doDelete = async () => {
    "use server";
    await softDeleteDocumentAction(documentId, id);
  };

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={doc.originalFileName}>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight truncate max-w-md">
            {doc.originalFileName}
          </h1>
          <DocumentStorageBadge storageProvider={doc.storageProvider} />
        </div>
        <div className="flex gap-2">
          {canDownload && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/documents/${documentId}/download`}>Descargar</a>
            </Button>
          )}
          {doc.storageProvider === "PLACEHOLDER" && doc.status !== "DELETED" && (
            <Button variant="outline" size="sm" disabled title="No hay archivo binario almacenado">
              Descargar no disponible
            </Button>
          )}
          {doc.canMutate && doc.status === "ACTIVE" && (
            <form action={doArchive}>
              <Button variant="outline" size="sm" type="submit">
                Archivar
              </Button>
            </form>
          )}
          {doc.canMutate && doc.status === "ARCHIVED" && (
            <form action={doRestore}>
              <Button variant="outline" size="sm" type="submit">
                Restaurar
              </Button>
            </form>
          )}
          {doc.canMutate && doc.status === "UPLOADING" && (
            <form action={doDelete}>
              <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                Cancelar subida
              </Button>
            </form>
          )}
          {doc.canMutate && doc.status !== "DELETED" && doc.status !== "UPLOADING" && (
            <form action={doDelete}>
              <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
                Eliminar
              </Button>
            </form>
          )}
        </div>
      </div>

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
