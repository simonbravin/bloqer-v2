import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getSubcontractCertificationById, getSubcontractById, ServiceError } from "@bloqer/services";
import { SubcontractCertificationForm } from "@/features/subcontracts";
import { updateSubcontractCertificationAction } from "../../../../actions";

interface PageProps { params: Promise<{ id: string; subcontractId: string; certId: string }> }

function toDateStr(d: Date | string): string {
  return new Date(d).toISOString().split("T")[0]!;
}

export default async function EditarCertificacionPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId, certId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let cert, subcontract;
  try {
    [cert, subcontract] = await Promise.all([
      getSubcontractCertificationById(certId, ctx),
      getSubcontractById(subcontractId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (cert.status !== "DRAFT") {
    redirect(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${certId}`);
  }

  const initialQuantities: Record<string, string> = {};
  for (const l of cert.lines) {
    initialQuantities[l.subcontractLineId] = l.currentQty;
  }

  const action = async (fd: FormData) => {
    "use server";
    return updateSubcontractCertificationAction(certId, fd);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${certId}`}>
            ← Certificación
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Editar certificación</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <SubcontractCertificationForm
          subcontractId={subcontractId}
          subcontractLines={subcontract.lines}
          action={action}
          mode="edit"
          initialQuantities={initialQuantities}
          defaultDates={{
            periodStart:       toDateStr(cert.periodStart),
            periodEnd:         toDateStr(cert.periodEnd),
            certificationDate: toDateStr(cert.certificationDate),
          }}
          defaultNotes={cert.notes ?? undefined}
        />
      </div>
    </div>
  );
}
