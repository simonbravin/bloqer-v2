import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getProjectCostControl, ServiceError } from "@bloqer/services";
import {
  CostControlSummaryCards,
  CostControlTable,
  CostControlFilters,
} from "@/features/cost-control";
import { ReportCsvExportLink } from "@/features/reports/report-csv-export-link";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { ReportPdfExportLink } from "@/features/reports/report-pdf-export-link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ budgetId?: string; dateFrom?: string; dateTo?: string; wbsSearch?: string }>;
}

export default async function ControlCostosPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const filters = {
    budgetId:  sp.budgetId,
    dateFrom:  sp.dateFrom,
    dateTo:    sp.dateTo,
    wbsSearch: sp.wbsSearch,
  };

  let result;
  try {
    result = await getProjectCostControl(projectId, filters, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  // availableBudgets is present on both result types
  const availableBudgets = result.availableBudgets;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}`}>← Proyecto</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Control de costos</h1>
        </div>
        {result.type === "REPORT" && (
          <div className="flex flex-wrap items-center gap-2">
            <ReportCsvExportLink
              exportPath={`/api/reports/proyectos/${projectId}/control-costos.csv`}
              params={sp}
            />
            <ReportPdfExportLink
              exportPath={`/api/reports/proyectos/${projectId}/control-costos.csv`}
              params={sp}
            />
            <ReportEmailSendDialog
              reportType="PROJECT_COST_CONTROL"
              supportsPdf
              params={sp}
              projectId={projectId}
              defaultRecipientEmail={current.session.user?.email ?? null}
            />
          </div>
        )}
      </div>

      <CostControlFilters budgets={availableBudgets} currentBudgetId={sp.budgetId} />

      {result.type === "BUDGET_SELECTION_REQUIRED" ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">El proyecto tiene {result.availableBudgets.length} presupuestos aprobados.</p>
          <p className="text-sm text-muted-foreground">Seleccioná uno en el filtro de arriba para ver el control de costos.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {result.availableBudgets.map((b) => (
              <Link
                key={b.id}
                href={`/proyectos/${projectId}/control-costos?budgetId=${b.id}`}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
              >
                {b.name} <span className="text-muted-foreground">({b.status})</span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Presupuesto: <strong>{result.budgetName}</strong> ({result.budgetStatus})</span>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{w}</p>
              ))}
            </div>
          )}

          {result.sectionsExcluded.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                Capas excluidas del reporte (módulo tenant deshabilitado)
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-800 dark:text-amber-300">
                {result.sectionsExcluded.map((s, i) => (
                  <li key={i}>
                    {s.module} — {s.section}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CostControlSummaryCards totals={result.totals} />

          {result.rows.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground text-sm">
              No hay ítems WBS en este presupuesto{sp.wbsSearch ? ` que coincidan con "${sp.wbsSearch}"` : ""}.
            </div>
          ) : (
            <CostControlTable rows={result.rows} totals={result.totals} projectId={projectId} />
          )}

          {(
            parseFloat(result.unallocatedCommittedCost) > 0 ||
            parseFloat(result.unallocatedReceivedCost)  > 0 ||
            parseFloat(result.unallocatedAccruedCost)   > 0 ||
            parseFloat(result.unallocatedPaidCost)      > 0 ||
            parseFloat(result.unallocatedInventoryConsumedCost) > 0
          ) && (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm font-semibold mb-3">Costos no asignados a WBS</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                {[
                  { label: "Comprometido", v: result.unallocatedCommittedCost },
                  { label: "Recibido",     v: result.unallocatedReceivedCost },
                  { label: "Devengado",    v: result.unallocatedAccruedCost },
                  { label: "Pagado",       v: result.unallocatedPaidCost },
                  { label: "Consumo inventario", v: result.unallocatedInventoryConsumedCost },
                ].map(({ label, v }) => (
                  <div key={label}>
                    <p className="text-muted-foreground">{label}</p>
                    <p className="font-medium">{parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
