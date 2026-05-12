import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { DocumentForm } from "@/features/documents";
import { isStorageConfigured } from "@bloqer/config";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoDocumentoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const storageConfigured = isStorageConfigured();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/documentos`}>← Documentos</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Agregar documento</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <DocumentForm projectId={id} storageConfigured={storageConfigured} />
      </div>
    </div>
  );
}
