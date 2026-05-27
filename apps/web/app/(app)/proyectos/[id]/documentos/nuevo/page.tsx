import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DocumentForm } from "@/features/documents";
import { isStorageConfigured } from "@bloqer/config";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoDocumentoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const storageConfigured = isStorageConfigured();

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/documentos`} label="Documentos" />
        <h1 className="text-2xl font-bold tracking-tight">Agregar documento</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <DocumentForm projectId={id} storageConfigured={storageConfigured} />
      </div>
    </PageShell>
  );
}
