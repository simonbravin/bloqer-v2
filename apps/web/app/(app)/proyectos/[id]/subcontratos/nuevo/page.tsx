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
import { isStorageConfigured } from "@bloqer/config";

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

  let wbsPick: Awaited<ReturnType<typeof getSubcontractFormWbsPickList>> | null = null;
  let companyResolveError: string | null = null;
  try {
    wbsPick = await getSubcontractFormWbsPickList(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "VALIDATION") {
      companyResolveError = err.message;
    } else {
      throw err;
    }
  }

  const [subcontractorOptions, budgetHints] = await Promise.all([
    listSubcontractorContacts(projectId, ctx),
    getWbsSubcontractBudgetHints(projectId, ctx, { excludeWithActiveContract: true }).catch(() => []),
  ]);

  const companyId = wbsPick?.companyId ?? "";

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo subcontrato</h1>
      </div>
      {companyResolveError || !companyId ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {companyResolveError ??
            "No hay una empresa activa en el tenant. Creá o activá una empresa antes de crear subcontratos."}
        </p>
      ) : null}
      {sp.filter === "pending" && budgetHints.length > 0 ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
          <p className="text-sm font-medium">Partidas pendientes de contrato</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {budgetHints.length}{" "}
            {budgetHints.length === 1 ? "ítem tiene" : "ítems tienen"} subcontrato en presupuesto sin
            contrato activo. Elegí una sugerencia en el formulario para comenzar.
          </p>
        </div>
      ) : null}
      {companyId && wbsPick ? (
        <div className="rounded-lg border bg-card p-6">
          <SubcontractForm
            projectId={projectId}
            companyId={companyId}
            subcontractorOptions={subcontractorOptions}
            wbsOptions={wbsPick.wbsOptions}
            budgetHints={budgetHints}
            initialWbsNodeId={sp.wbsNodeId}
            action={createSubcontractAction}
            allowAttachments
            storageConfigured={isStorageConfigured()}
          />
        </div>
      ) : null}
    </PageShell>
  );
}
