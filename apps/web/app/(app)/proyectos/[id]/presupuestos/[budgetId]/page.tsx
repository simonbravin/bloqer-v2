import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BudgetStatusBadge, WbsTree, BudgetTotalsPanel } from "@/features/budgets";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import { getBudgetById, getWbsTree, listEntityDocuments, ServiceError } from "@bloqer/services";
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
    [budget, tree] = await Promise.all([
      getBudgetById(budgetId, ctx),
      getWbsTree(budgetId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (budget.projectId !== projectId) notFound();

  const budgetAttachments = await listEntityDocuments("BUDGET", budgetId, ctx, { projectId });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "BUDGETS");

  const editable = budget.status === "DRAFT" || budget.status === "RETURNED_FOR_CHANGES";

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/presupuestos`}>← Presupuestos</Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{budget.name}</h1>
              <span className="text-sm text-muted-foreground font-mono">v{budget.versionNumber}</span>
              <BudgetStatusBadge status={budget.status} />
            </div>
            <p className="text-xs text-muted-foreground">{budget.currency}</p>
          </div>
        </div>
        {editable && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/presupuestos/${budgetId}/editar`}>
              Configuración
            </Link>
          </Button>
        )}
      </div>

      {/* Main content */}
      <div className="flex gap-4 items-start">
        {/* WBS tree takes most of the space */}
        <div className="flex-1 min-w-0">
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
        </div>

        {/* Right sidebar: totals + lifecycle */}
        <div className="w-56 shrink-0">
          <BudgetTotalsPanel
            status={budget.status}
            currency={budget.currency}
            totalCost={budget.totalCost.toString()}
            totalSalePrice={budget.totalSalePrice.toString()}
            onSubmitForReview={submitForReviewAction.bind(null, budgetId)}
            onReturnForChanges={returnForChangesAction.bind(null, budgetId)}
            onApprove={approveBudgetAction.bind(null, budgetId)}
            onClose={closeBudgetAction.bind(null, budgetId)}
            onCancel={cancelBudgetAction.bind(null, budgetId)}
          />
        </div>
      </div>

      <EntityDocumentsPanel
        projectId={projectId}
        linkedEntity={{ type: "BUDGET", id: budgetId }}
        storageConfigured={storageConfigured}
        docs={budgetAttachments}
        canEdit={canEditAttachments}
      />
    </div>
  );
}
