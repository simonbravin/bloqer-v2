import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BudgetStatusBadge, WbsTree, BudgetTotalsPanel } from "@/features/budgets";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { getCurrentUser } from "@/lib/auth";
import { getBudgetById, getWbsTree, ServiceError } from "@bloqer/services";
import { formatMoneyAmount } from "@/lib/format-money";
import { PageBackLink } from "@/components/layout/page-back-link";
import { PageShell } from "@/components/layout/page-shell";
import {
  addWbsNodeAction,
  updateWbsNodeAction,
  removeWbsNodeAction,
  reorderWbsNodesAction,
  updateCostItemAction,
  addCostAnalysisLineAction,
  updateCostAnalysisLineAction,
  removeCostAnalysisLineAction,
  submitForReviewAction,
  returnForChangesAction,
  approveBudgetAction,
  closeBudgetAction,
  cancelBudgetAction,
} from "../actions";

interface PageProps {
  params: Promise<{ id: string; budgetId: string }>;
}

export default async function PresupuestoDetailPage({ params }: PageProps) {
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
  let tree;
  try {
    [budget, tree] = await Promise.all([getBudgetById(budgetId, ctx), getWbsTree(budgetId, ctx)]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (budget.projectId !== projectId) notFound();

  const editable = budget.status === "DRAFT" || budget.status === "RETURNED_FOR_CHANGES";
  const costStr = budget.totalCost.toString();
  const saleStr = budget.totalSalePrice.toString();
  const costN = parseFloat(costStr);
  const saleN = parseFloat(saleStr);
  const marginStr =
    Number.isFinite(costN) && Number.isFinite(saleN)
      ? formatMoneyAmount(String(saleN - costN), budget.currency)
      : "—";

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="space-y-4">
        <PageBackLink href={`/proyectos/${projectId}/presupuestos`} label="Presupuestos" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{budget.name}</h1>
              <span className="font-mono text-sm text-muted-foreground">v{budget.versionNumber}</span>
              <BudgetStatusBadge status={budget.status} />
            </div>
            <p className="text-sm text-muted-foreground">Moneda: {budget.currency}</p>
          </div>
          {editable ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${projectId}/presupuestos/${budgetId}/editar`}>
                Configuración
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <KpiStatGrid columns={3}>
        <KpiStatCard
          label="Costo directo total"
          value={formatMoneyAmount(costStr, budget.currency)}
        />
        <KpiStatCard
          label="Precio de venta total"
          value={formatMoneyAmount(saleStr, budget.currency)}
          variant="highlight"
        />
        <KpiStatCard label="Margen (venta − costo)" value={marginStr} tone="muted" />
      </KpiStatGrid>

      <div className="grid gap-6 xl:grid-cols-[1fr_17rem]">
        <WbsTree
          nodes={tree}
          budgetId={budgetId}
          currency={budget.currency}
          editable={editable}
          onAddNode={addWbsNodeAction}
          onUpdateNode={updateWbsNodeAction}
          onRemoveNode={removeWbsNodeAction}
          onReorderNodes={reorderWbsNodesAction}
          onUpdateCostItem={updateCostItemAction}
          onAddLine={addCostAnalysisLineAction}
          onUpdateLine={updateCostAnalysisLineAction}
          onRemoveLine={removeCostAnalysisLineAction}
        />

        <BudgetTotalsPanel
          status={budget.status}
          currency={budget.currency}
          totalCost={costStr}
          totalSalePrice={saleStr}
          onSubmitForReview={submitForReviewAction.bind(null, budgetId)}
          onReturnForChanges={returnForChangesAction.bind(null, budgetId)}
          onApprove={approveBudgetAction.bind(null, budgetId)}
          onClose={closeBudgetAction.bind(null, budgetId)}
          onCancel={cancelBudgetAction.bind(null, budgetId)}
        />
      </div>
    </PageShell>
  );
}
