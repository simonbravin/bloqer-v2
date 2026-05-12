import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CertificationStatusBadge, CertificationEditForm } from "@/features/certifications";
import { getCurrentUser } from "@/lib/auth";
import { getCertificationById, ServiceError } from "@bloqer/services";
import { updateCertificationAction } from "../../actions";

interface PageProps {
  params: Promise<{ id: string; certId: string }>;
}

export default async function EditarCertificacionPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, certId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let cert;
  try {
    cert = await getCertificationById(certId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (cert.status !== "DRAFT") redirect(`/proyectos/${projectId}/certificaciones/${certId}`);

  const toDateInput = (d: Date | string) => new Date(d).toISOString().split("T")[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/certificaciones/${certId}`}>← Volver</Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Editar encabezado</h1>
            <CertificationStatusBadge status={cert.status} />
          </div>
          <p className="text-sm text-muted-foreground font-mono">{cert.code}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <CertificationEditForm
          certId={certId}
          projectId={projectId}
          defaults={{
            periodStart: toDateInput(cert.periodStart),
            periodEnd: toDateInput(cert.periodEnd),
            notes: cert.notes ?? "",
            internalNotes: cert.internalNotes ?? "",
          }}
          onSubmit={(data) => updateCertificationAction(certId, projectId, data)}
        />
      </div>
    </div>
  );
}
