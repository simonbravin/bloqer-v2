import { notFound, redirect } from "next/navigation";
import { BudgetForm } from "@/features/budgets";
import type { BudgetParentOption } from "@/features/budgets/components/budget-form";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listBudgetsByProject, ServiceError } from "@bloqer/services";
import { createBudgetAction, executeWbsImportOnCreateAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ parentBudgetId?: string }>;
}

export default async function NuevoPresupuestoPage({ params, searchParams }: PageProps) {
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

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const budgets = await listBudgetsByProject(projectId, ctx);
  const parentOptions: BudgetParentOption[] = budgets
    .filter((b) => b.status === "APPROVED" || b.status === "CLOSED")
    .map((b) => ({
      id: b.id,
      versionNumber: b.versionNumber,
      name: b.name,
      status: b.status as "APPROVED" | "CLOSED",
      currency: b.currency,
      overheadPct: Number(b.settings?.overheadPct ?? 0),
      financialCostPct: Number(b.settings?.financialCostPct ?? 0),
      financialDaysAvg: Number(b.settings?.financialDaysAvg ?? 0),
      profitPct: Number(b.settings?.profitPct ?? 0),
      taxPct: Number(b.settings?.taxPct ?? 0),
    }));

  const initialParentBudgetId =
    sp.parentBudgetId && parentOptions.some((p) => p.id === sp.parentBudgetId)
      ? sp.parentBudgetId
      : null;

  const isAddendum = Boolean(initialParentBudgetId);

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title={isAddendum ? "Nueva adenda / fase" : "Nuevo presupuesto"}
        subtitle={
          isAddendum
            ? "Presupuesto complementario vinculado a uno aprobado o cerrado"
            : parentOptions.length > 0
              ? "Podés vincularlo como adenda a un presupuesto aprobado o cerrado"
              : undefined
        }
      />
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <BudgetForm
          projectId={projectId}
          parentOptions={parentOptions}
          initialParentBudgetId={initialParentBudgetId}
          onSubmit={createBudgetAction.bind(null, projectId)}
          onImportWbs={executeWbsImportOnCreateAction.bind(null, projectId)}
        />
      </div>
    </PageShell>
  );
}
