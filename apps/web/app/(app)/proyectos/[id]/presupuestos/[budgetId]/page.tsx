import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BudgetStatusBadge,
  WbsTree,
  BudgetLifecycleDialog,
  BudgetMarginConfigSection,
  BudgetExportActions,
} from "@/features/budgets";
import { BudgetWbsViewProvider } from "@/features/budgets/lib/wbs-view-mode";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { getCurrentUser } from "@/lib/auth";
import {
  getBudgetById,
  getBudgetLifecycleLog,
  getWbsTree,
  isBudgetScheduleBaseline,
  listBudgetsByProject,
  ServiceError,
  type WbsViewNode,
} from "@bloqer/services";
import { addDecimal, multiplyDecimal, serializeMoney } from "@bloqer/utils";
import { formatMoneyAmount } from "@/lib/format-money";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  addWbsNodeAction,
  ensureWbsLeafForApuAction,
  updateWbsNodeAction,
  removeWbsNodeAction,
  reorderWbsNodesAction,
  previewWbsImportAction,
  executeWbsImportAction,
  updateCostItemAction,
  saveCostItemApuAction,
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

  let budget: Awaited<ReturnType<typeof getBudgetById>> | undefined;
  let tree: WbsViewNode[] = [];
  let lifecycleLog;
  let scheduleBaseline = false;
  let parentBudget: { id: string; name: string; versionNumber: number } | null = null;
  try {
    [budget, tree, lifecycleLog, scheduleBaseline] = await Promise.all([
      getBudgetById(budgetId, ctx),
      getWbsTree(budgetId, ctx),
      getBudgetLifecycleLog(budgetId, ctx),
      isBudgetScheduleBaseline(budgetId, ctx.tenantId),
    ]);
    if (budget.parentBudgetId) {
      const siblings = await listBudgetsByProject(projectId, ctx);
      const parent = siblings.find((b) => b.id === budget!.parentBudgetId);
      if (parent) {
        parentBudget = {
          id: parent.id,
          name: parent.name,
          versionNumber: parent.versionNumber,
        };
      }
    }
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  if (!budget || budget.projectId !== projectId) notFound();

  const editable = budget.status === "DRAFT" || budget.status === "RETURNED_FOR_CHANGES";
  const wbsStructureEditable = editable && !scheduleBaseline;
  const canCreateAddendum = budget.status === "APPROVED" || budget.status === "CLOSED";
  const hasLeafItems = (() => {
    function walk(nodes: WbsViewNode[]): boolean {
      for (const n of nodes) {
        if (n.type === "ITEM") return true;
        if (walk(n.children)) return true;
      }
      return false;
    }
    return walk(tree);
  })();
  const costStr = serializeMoney(budget.totalCost.toString());
  const saleStr = serializeMoney(budget.totalSalePrice.toString());
  const marginStr = formatMoneyAmount(
    serializeMoney(addDecimal(saleStr, multiplyDecimal(costStr, "-1"))),
    budget.currency,
  );

  const s = budget.settings;
  const settingsDefaults = {
    overheadPct: s ? parseFloat(s.overheadPct.toString()) : 0,
    financialCostPct: s ? parseFloat(s.financialCostPct.toString()) : 0,
    financialDaysAvg: s?.financialDaysAvg ?? 0,
    profitPct: s ? parseFloat(s.profitPct.toString()) : 0,
    taxPct: s ? parseFloat(s.taxPct.toString()) : 0,
  };

  return (
    <BudgetWbsViewProvider budgetId={budgetId}>
      <PageShell variant="default" className="space-y-6" breadcrumbLabel={budget.name}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{budget.name}</h1>
                <span className="font-mono text-sm text-muted-foreground">v{budget.versionNumber}</span>
                <BudgetStatusBadge status={budget.status} />
              </div>
              <p className="text-sm text-muted-foreground">Moneda: {budget.currency}</p>
              {parentBudget && (
                <p className="text-sm text-muted-foreground">
                  Adenda de{" "}
                  <Link
                    href={`/proyectos/${projectId}/presupuestos/${parentBudget.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    v{parentBudget.versionNumber} — {parentBudget.name}
                  </Link>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canCreateAddendum && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/proyectos/${projectId}/presupuestos/nuevo?parentBudgetId=${budgetId}`}
                  >
                    Crear adenda / fase
                  </Link>
                </Button>
              )}
              <BudgetLifecycleDialog
                status={budget.status}
                lifecycleLog={lifecycleLog}
                warnEmptyOnApprove={!hasLeafItems}
                onSubmitForReview={submitForReviewAction.bind(null, budgetId, projectId)}
                onReturnForChanges={returnForChangesAction.bind(null, budgetId, projectId)}
                onApprove={approveBudgetAction.bind(null, budgetId, projectId)}
                onClose={closeBudgetAction.bind(null, budgetId, projectId)}
                onCancel={cancelBudgetAction.bind(null, budgetId, projectId)}
              />
              <BudgetExportActions projectId={projectId} budgetId={budgetId} />
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
          structureEditable={wbsStructureEditable}
          structureLockedReason={
            editable && scheduleBaseline
              ? "Este presupuesto es la base del cronograma. La estructura EDT está bloqueada; podés seguir editando APU y costos en los ítems."
              : undefined
          }
          onPreviewWbsImport={
            wbsStructureEditable
              ? previewWbsImportAction.bind(null, budgetId, projectId)
              : undefined
          }
          onExecuteWbsImport={
            wbsStructureEditable
              ? executeWbsImportAction.bind(null, budgetId, projectId)
              : undefined
          }
          onAddNode={addWbsNodeAction.bind(null, budgetId, projectId)}
          onEnsureLeafForApu={ensureWbsLeafForApuAction.bind(null, budgetId, projectId)}
          onUpdateNode={updateWbsNodeAction.bind(null, projectId, budgetId)}
          onRemoveNode={removeWbsNodeAction.bind(null, projectId, budgetId)}
          onReorderNodes={reorderWbsNodesAction.bind(null, budgetId, projectId)}
          onUpdateCostItem={updateCostItemAction.bind(null, projectId, budgetId)}
          onAddLine={addCostAnalysisLineAction.bind(null, projectId, budgetId)}
          onUpdateLine={updateCostAnalysisLineAction.bind(null, projectId, budgetId)}
          onRemoveLine={removeCostAnalysisLineAction.bind(null, projectId, budgetId)}
          onSaveApu={saveCostItemApuAction.bind(null, projectId, budgetId)}
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
            Sin parámetros económicos configurados.
          </section>
        )}
      </PageShell>
    </BudgetWbsViewProvider>
  );
}
