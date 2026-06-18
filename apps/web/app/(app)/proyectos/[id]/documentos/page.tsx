import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured } from "@bloqer/config";
import { getProjectShellInfo, listProjectDocuments, ServiceError } from "@bloqer/services";
import { DocumentListSection, DocumentFilters, DocumentUploadDialog } from "@/features/documents";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    category?: string;
    status?: string;
    search?: string;
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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const status = VALID_STATUSES.includes(sp.status as never)
    ? (sp.status as "ACTIVE" | "ARCHIVED")
    : "ACTIVE";
  const category = VALID_CATEGORIES.includes(sp.category as never)
    ? (sp.category as never)
    : undefined;

  let docs;
  try {
    docs = await listProjectDocuments(
      id,
      { status, category, search: sp.search || undefined },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Documentos"
        subtitle={`${docs.length} ${docs.length === 1 ? "documento" : "documentos"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`documentos-${id}`} />
            </Suspense>
            <DocumentUploadDialog
              projectId={id}
              storageConfigured={isStorageConfigured()}
              revalidatePaths={[`/proyectos/${id}/documentos`]}
              triggerLabel="Agregar documento"
              title="Agregar documento"
              submitLabel="Subir documento"
              showPlusIcon
            />
          </>
        }
      />

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <DocumentFilters />
        </Suspense>
      </div>

      <Suspense fallback={<ListSectionSkeleton />}>
        <DocumentListSection docs={docs} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
