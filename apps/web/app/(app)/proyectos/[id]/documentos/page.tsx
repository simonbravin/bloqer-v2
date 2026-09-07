import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured } from "@bloqer/config";
import { can } from "@bloqer/domain";
import {
  getProjectShellInfo,
  listProjectDocumentFolders,
  listProjectDocuments,
  ServiceError,
} from "@bloqer/services";
import {
  DocumentFolderTree,
  DocumentListSection,
  DocumentFilters,
  DocumentUploadDialog,
} from "@/features/documents";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    category?: string;
    status?: string;
    search?: string;
    folderId?: string;
  }>;
}

const VALID_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
const VALID_CATEGORIES = [
  "CONTRACT",
  "PLAN",
  "PERMIT",
  "TECHNICAL",
  "PHOTO",
  "INVOICE",
  "RECEIPT",
  "CERTIFICATE",
  "REPORT",
  "JOBSITE_EVIDENCE",
  "BUDGET",
  "QUOTE",
  "OTHER",
] as const;

export default async function DocumentosPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const status = VALID_STATUSES.includes(sp.status as never)
    ? (sp.status as "ACTIVE" | "ARCHIVED")
    : "ACTIVE";
  const category = VALID_CATEGORIES.includes(sp.category as never)
    ? (sp.category as never)
    : undefined;
  const folderId =
    typeof sp.folderId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sp.folderId)
      ? sp.folderId
      : undefined;

  let folders;
  try {
    folders = await listProjectDocumentFolders(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const selectedFolder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  if (folderId && !selectedFolder) notFound();

  let docs;
  try {
    docs = await listProjectDocuments(
      id,
      { status, category, search: sp.search || undefined, folderId },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const storageConfigured = isStorageConfigured();
  const canEdit = can(ctx.roles, "EDIT", "PROJECTS");
  const allowsUpload = selectedFolder ? selectedFolder.allowsLibraryWrites : true;
  const uploadFolderId = selectedFolder?.allowsLibraryWrites ? selectedFolder.id : undefined;
  const folderLabel = selectedFolder?.name ?? "Todos";

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Documentos"
        subtitle={`${folderLabel} · ${docs.length} ${docs.length === 1 ? "documento" : "documentos"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`documentos-${id}`} />
            </Suspense>
            {allowsUpload ? (
              <DocumentUploadDialog
                projectId={id}
                folderId={uploadFolderId}
                storageConfigured={storageConfigured}
                revalidatePaths={[`/proyectos/${id}/documentos`]}
                triggerLabel="Agregar documento"
                title="Agregar documento"
                submitLabel="Subir documento"
                showPlusIcon
              />
            ) : null}
          </>
        }
      />

      {!storageConfigured ? (
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/10 dark:text-amber-300"
        >
          <p className="font-medium">Almacenamiento de archivos no configurado</p>
          <p className="mt-1">
            Las nuevas subidas solo guardarán metadata y aparecerán como{" "}
            <strong>Archivo no almacenado</strong>. No habrá descarga disponible hasta configurar el
            almacenamiento en el entorno.
          </p>
        </div>
      ) : null}

      {selectedFolder && !selectedFolder.allowsLibraryWrites ? (
        <div
          role="note"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          Esta carpeta se completa sola con adjuntos de{" "}
          <strong className="text-foreground">{selectedFolder.name}</strong>. Para subir archivos de
          biblioteca usá <strong className="text-foreground">General</strong> o{" "}
          <strong className="text-foreground">Planos</strong> (y sus subcarpetas).
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <aside className="rounded-lg border bg-card p-3 lg:sticky lg:top-4 lg:self-start">
          <Suspense fallback={<div className="h-40 animate-pulse rounded bg-muted/40" />}>
            <DocumentFolderTree
              projectId={id}
              folders={folders}
              selectedFolderId={selectedFolder?.id ?? null}
              canEdit={canEdit}
            />
          </Suspense>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <Suspense>
              <DocumentFilters />
            </Suspense>
          </div>

          <Suspense fallback={<ListSectionSkeleton />}>
            <DocumentListSection docs={docs} projectId={id} />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}
