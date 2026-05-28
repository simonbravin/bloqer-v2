import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BudgetStatusBadge, WbsTree, BudgetLifecycleDialog, BudgetMarginConfigSection } from "@/features/budgets";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { getCurrentUser } from "@/lib/auth";
import { getBudgetById, getBudgetLifecycleLog, getWbsTree, ServiceError } from "@bloqer/services";
import { formatMoneyAmount } from "@/lib/format-money";
import { PageBackLink } from "@/components/layout/page-back-link";
import { PageShell } from "@/components/layout/page-shell";
import {
  addWbsNodeAction,
  updateWbsNodeAction,
  removeWbsNodeAction,
  reorderWbsNodesAction,
  previewWbsImportAction,
  executeWbsImportAction,
  updateCostItemAction,
  addCostAnalysisLineAction,
  updateCostAnalysisLineAction,
  removeCostAnalysisLineAction,
  submitForReviewAction,
  returnForChangesAction,
  approveBudgetAction,
  closeBudgetAction,
  cancelBudgetAction,
  updateBudgetSettingsAction,
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
  let lifecycleLog;
  try {
    [budget, tree, lifecycleLog] = await Promise.all([
      getBudgetById(budgetId, ctx),
      getWbsTree(budgetId, ctx),
      getBudgetLifecycleLog(budgetId, ctx),
    ]);
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

  const s = budget.settings;
  const settingsDefaults = {
    overheadPct: s ? parseFloat(s.overheadPct.toString()) : 0,
    financialCostPct: s ? parseFloat(s.financialCostPct.toString()) : 0,
    profitPct: s ? parseFloat(s.profitPct.toString()) : 0,
    taxPct: s ? parseFloat(s.taxPct.toString()) : 0,
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <BudgetLifecycleDialog
              status={budget.status}
              lifecycleLog={lifecycleLog}
              onSubmitForReview={submitForReviewAction.bind(null, budgetId, projectId)}
              onReturnForChanges={returnForChangesAction.bind(null, budgetId, projectId)}
              onApprove={approveBudgetAction.bind(null, budgetId, projectId)}
              onClose={closeBudgetAction.bind(null, budgetId, projectId)}
              onCancel={cancelBudgetAction.bind(null, budgetId, projectId)}
            />
            <Link
              href="#configuracion"
              className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
            >
              Configuración
            </Link>
          </div>
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

      <WbsTree
        nodes={tree}
        budgetId={budgetId}
        projectId={projectId}
        currency={budget.currency}
        editable={editable}
        onPreviewWbsImport={previewWbsImportAction.bind(null, budgetId, projectId)}
        onExecuteWbsImport={executeWbsImportAction.bind(null, budgetId, projectId)}
        onAddNode={addWbsNodeAction.bind(null, budgetId, projectId)}
        onUpdateNode={updateWbsNodeAction.bind(null, projectId, budgetId)}
        onRemoveNode={removeWbsNodeAction.bind(null, projectId, budgetId)}
        onReorderNodes={reorderWbsNodesAction.bind(null, budgetId, projectId)}
        onUpdateCostItem={updateCostItemAction.bind(null, projectId, budgetId)}
        onAddLine={addCostAnalysisLineAction.bind(null, projectId, budgetId)}
        onUpdateLine={updateCostAnalysisLineAction.bind(null, projectId, budgetId)}
        onRemoveLine={removeCostAnalysisLineAction.bind(null, projectId, budgetId)}
      />

      {budget.settings ? (
        <BudgetMarginConfigSection
          defaults={settingsDefaults}
          totalDirectCost={costStr}
          totalSalePrice={saleStr}
          currency={budget.currency}
          editable={editable}
          onSubmit={updateBudgetSettingsAction.bind(null, budgetId, projectId)}
        />
      ) : (
        <section
          id="configuracion"
          className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground"
        >
          Este presupuesto no tiene parámetros económicos configurados. Contactá soporte si necesitás
          editar márgenes.
        </section>
      )}
    </PageShell>
  );
}
