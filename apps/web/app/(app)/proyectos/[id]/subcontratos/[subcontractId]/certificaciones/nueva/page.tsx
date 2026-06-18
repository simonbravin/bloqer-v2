import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSubcontractById, ServiceError } from "@bloqer/services";
import { SubcontractCertificationForm } from "@/features/subcontracts";
import { createSubcontractCertificationAction } from "../../../actions";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string; subcontractId: string }>;
}

export default async function NuevaCertificacionPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let subcontract;
  try {
    subcontract = await getSubcontractById(subcontractId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (subcontract.status !== "ACTIVE") {
    redirect(`/proyectos/${projectId}/subcontratos/${subcontractId}`);
  }

  return (
    <PageShell
      variant="default"
      className="space-y-6"
      breadcrumbSegmentLabels={{ [subcontractId]: subcontract.code }}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva certificación</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <SubcontractCertificationForm
          subcontractId={subcontractId}
          subcontractLines={subcontract.lines}
          action={createSubcontractCertificationAction}
        />
      </div>
    </PageShell>
  );
}
