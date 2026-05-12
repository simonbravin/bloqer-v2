import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listProjectDocuments, ServiceError } from "@bloqer/services";
import { notFound } from "next/navigation";
import { DocumentList, DocumentFilters } from "@/features/documents";

interface PageProps {
  params:      Promise<{ id: string }>;
  searchParams: Promise<{
    category?: string;
    status?:   string;
    search?:   string;
  }>;
}

const VALID_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
const VALID_CATEGORIES = [
  "CONTRACT","PLAN","PERMIT","TECHNICAL","PHOTO",
  "INVOICE","RECEIPT","CERTIFICATE","REPORT","JOBSITE_EVIDENCE","OTHER",
] as const;

export default async function DocumentosPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const status   = VALID_STATUSES.includes(sp.status as never) ? sp.status as "ACTIVE" | "ARCHIVED" : "ACTIVE";
  const category = VALID_CATEGORIES.includes(sp.category as never) ? sp.category as never : undefined;

  let docs;
  try {
    docs = await listProjectDocuments(id, { status, category, search: sp.search || undefined }, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}`}>← Proyecto</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
        </div>
        <Button asChild size="sm">
          <Link href={`/proyectos/${id}/documentos/nuevo`}>+ Agregar documento</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <DocumentFilters />
        </Suspense>
      </div>

      <div className="text-sm text-muted-foreground">
        {docs.length} documento{docs.length !== 1 ? "s" : ""}
      </div>

      <DocumentList docs={docs} projectId={id} />
    </div>
  );
}
