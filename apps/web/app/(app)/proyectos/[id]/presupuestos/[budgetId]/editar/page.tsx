import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BudgetStatusBadge, BudgetSettingsForm } from "@/features/budgets";
import { getCurrentUser } from "@/lib/auth";
import { getBudgetById, getProjectShellInfo, ServiceError } from "@bloqer/services";
import { updateBudgetSettingsAction } from "../../actions";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";

interface PageProps {
  params: Promise<{ id: string; budgetId: string }>;
}

export default async function EditarPresupuestoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, budgetId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let budget;
  let project;
  try {
    [budget, project] = await Promise.all([
      getBudgetById(budgetId, ctx),
      getProjectShellInfo(projectId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const editable = budget.status === "DRAFT" || budget.status === "RETURNED_FOR_CHANGES";
  const s = budget.settings;

  const defaults = {
    overheadPct: s ? parseFloat(s.overheadPct.toString()) : 0,
    financialCostPct: s ? parseFloat(s.financialCostPct.toString()) : 0,
    financialDaysAvg: s ? s.financialDaysAvg : 0,
    profitPct: s ? parseFloat(s.profitPct.toString()) : 0,
    taxPct: s ? parseFloat(s.taxPct.toString()) : 0,
    notes: s?.notes ?? null,
  };

  return (
    <PageShell variant="form" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Configuración del presupuesto"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {budget.name} — v{budget.versionNumber}
            <BudgetStatusBadge status={budget.status} />
          </span>
        }
        actions={
          <Link
            href={`/proyectos/${projectId}/presupuestos/${budgetId}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Volver al editor WBS
          </Link>
        }
      />

      {!editable && (
        <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          Este presupuesto está en estado <strong>{budget.status}</strong> y no permite cambios en
          la configuración.
        </div>
      )}

      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">Parámetros económicos</h2>
        <BudgetSettingsForm
          defaults={defaults}
          onSubmit={updateBudgetSettingsAction.bind(null, budgetId)}
        />
      </div>
    </PageShell>
  );
}
