import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getSubcontractFormWbsPickList,
  getWbsSubcontractBudgetHints,
  listSubcontractorContacts,
  ServiceError,
} from "@bloqer/services";
import { SubcontractForm } from "@/features/subcontracts";
import { createSubcontractAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wbsNodeId?: string; filter?: string; from?: string }>;
}

export default async function NuevoSubcontratoPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let wbsPick: Awaited<ReturnType<typeof getSubcontractFormWbsPickList>>;
  try {
    wbsPick = await getSubcontractFormWbsPickList(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [subcontractorOptions, budgetHints] = await Promise.all([
    listSubcontractorContacts(projectId, ctx),
    getWbsSubcontractBudgetHints(projectId, ctx, { excludeWithActiveContract: true }).catch(() => []),
  ]);

  const companyId = wbsPick.companyId || current.tenantCtx.companyId || "";

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${projectId}/subcontratos`} label="Subcontratos" />
        <h1 className="text-2xl font-bold tracking-tight">Nuevo subcontrato</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <SubcontractForm
          projectId={projectId}
          companyId={companyId}
          subcontractorOptions={subcontractorOptions}
          wbsOptions={wbsPick.wbsOptions}
          budgetHints={budgetHints}
          initialWbsNodeId={sp.wbsNodeId}
          action={createSubcontractAction}
        />
      </div>
    </PageShell>
  );
}
