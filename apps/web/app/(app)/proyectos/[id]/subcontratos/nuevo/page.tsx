import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getSubcontractFormWbsPickList, listSubcontractorContacts, ServiceError } from "@bloqer/services";
import { SubcontractForm } from "@/features/subcontracts";
import { createSubcontractAction } from "../actions";

interface PageProps { params: Promise<{ id: string }> }

export default async function NuevoSubcontratoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let wbsPick: Awaited<ReturnType<typeof getSubcontractFormWbsPickList>>;
  try {
    wbsPick = await getSubcontractFormWbsPickList(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const subcontractorOptions = await listSubcontractorContacts(projectId, ctx);

  const companyId = wbsPick.companyId || current.tenantCtx.companyId || "";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/subcontratos`}>← Subcontratos</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo subcontrato</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <SubcontractForm
          projectId={projectId}
          companyId={companyId}
          subcontractorOptions={subcontractorOptions}
          wbsOptions={wbsPick.wbsOptions}
          action={createSubcontractAction}
        />
      </div>
    </div>
  );
}
