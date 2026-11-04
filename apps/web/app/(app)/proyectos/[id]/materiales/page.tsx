import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { compareDecimal } from "@bloqer/utils";
import {
  canEditPurchaseRequests,
  canViewPurchaseRequests,
  getMaterialLinesWithoutProduct,
  getMaterialVarianceReport,
  listApprovedBudgetsForProject,
  getProjectMaterialsBoard,
  getProjectShellInfo,
  getTenantModuleGate,
  ServiceError,
  type AvailableBudget,
  type MaterialsBoardRow,
  type MaterialsBoardWindow,
  type ServiceContext,
} from "@bloqer/services";
import type { MaterialsFieldRow } from "@bloqer/services/materials-field";
import { MaterialsBoardTable } from "@/features/materials/materials-board-table";
import { MaterialsFieldExperience } from "@/features/materials/materials-field-experience";
import { MaterialsToolbar } from "@/features/materials/materials-toolbar";
import { MaterialWbsTable, ReportDateFilters } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatDecimalArFromString, formatMoneyAmount, formatMoneyDisplay } from "@/lib/format-money";
import { isMaterialsFieldViewport, parseViewportHint, VIEWPORT_COOKIE } from "@/lib/viewport-hint-cookie";

import { planningReadError } from "@/features/cost-control/lib/planning-read-error";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    window?: string;
    budgetId?: string;
    dateFrom?: string;
    dateTo?: string;
    wbsNodeId?: string;
  }>;
}

const WINDOWS: MaterialsBoardWindow[] = ["this_week", "next_14_days", "month", "all"];

function windowLabel(w: MaterialsBoardWindow): string {
  switch (w) {
    case "this_week":
      return "Esta semana";
    case "next_14_days":
      return "Próximos 14 días";
    case "month":
      return "Este mes";
    default:
      return "Todo";
  }
}

function materialsQuery(opts: {
  tab?: "operativo" | "varianza";
  window?: MaterialsBoardWindow;
  budgetId?: string;
  wbsNodeId?: string;
  dateFrom?: string;
  dateTo?: string;
}): string {
  const sp = new URLSearchParams();
  if (opts.tab === "varianza") sp.set("tab", "varianza");
  if (opts.window && opts.tab !== "varianza") sp.set("window", opts.window);
  if (opts.budgetId) sp.set("budgetId", opts.budgetId);
  if (opts.wbsNodeId) sp.set("wbsNodeId", opts.wbsNodeId);
  if (opts.dateFrom) sp.set("dateFrom", opts.dateFrom);
  if (opts.dateTo) sp.set("dateTo", opts.dateTo);
  const q = sp.toString();
  return q ? `?${q}` : "";
}

function toMaterialsFieldRow(row: MaterialsBoardRow): MaterialsFieldRow {
  return {
    rowKey: row.rowKey,
    wbsNodeId: row.wbsNodeId,
    wbsCode: row.wbsCode,
    wbsName: row.wbsName,
    costAnalysisLineId: row.costAnalysisLineId,
    productId: row.productId,
    productSku: row.productSku,
    description: row.description,
    unit: row.unit,
    needQty: row.needQty,
    orderedQty: row.orderedQty,
    receivedQty: row.receivedQty,
    consumedQty: row.consumedQty,
    shortfallQty: row.shortfallQty,
    pendingReceiptQty: row.pendingReceiptQty,
    requiredStart: row.requiredStart,
    requiredEnd: row.requiredEnd,
    unscheduled: row.unscheduled,
    relatedPurchaseRequestId: row.relatedPurchaseRequestId,
    relatedPurchaseRequestNumber: row.relatedPurchaseRequestNumber,
    relatedPurchaseOrderId: row.relatedPurchaseOrderId,
    relatedPurchaseOrderNumber: row.relatedPurchaseOrderNumber,
  };
}

export default async function ProyectoMaterialesPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "varianza" ? "varianza" : "operativo";
  const window = (WINDOWS.includes(sp.window as MaterialsBoardWindow)
    ? sp.window
    : "next_14_days") as MaterialsBoardWindow;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project: Awaited<ReturnType<typeof getProjectShellInfo>>;
  try {
    project = await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const hint = parseViewportHint((await cookies()).get(VIEWPORT_COOKIE)?.value);
  const loadField = isMaterialsFieldViewport(hint);

  const gate = await getTenantModuleGate(ctx);
  const canRequest = project.status === "ACTIVE" && gate.isEnabled("PROCUREMENT") && canEditPurchaseRequests(ctx.roles);
  const showCompras =
    gate.isEnabled("PROCUREMENT") &&
    (canViewPurchaseRequests(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));
  const showConsumos = gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");

  if (loadField) {
    const started = Date.now();
    let board;
    try {
      board = await getProjectMaterialsBoard(projectId, { window: "all", budgetId: sp.budgetId }, ctx);
    } catch (err) {
      if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
      return <PageShell className="space-y-6"><ProjectPageHeader title="Materiales" />{planningReadError(err, `/proyectos/${projectId}/materiales`)}</PageShell>;
    }
    const queryMs = Date.now() - started;
    const rows = board.type === "REPORT" ? board.rows.map(toMaterialsFieldRow) : [];
    return (
      <PageShell variant="default" className="space-y-6">
        <div className="space-y-3">
          <ProjectPageHeader title="Materiales" subtitle="Necesidad, pedido y recepción de la obra" />
          <MaterialsToolbar
            mode="field"
            projectId={projectId}
            showCompras={showCompras}
            showConsumos={showConsumos}
          />
        </div>
        {board.type === "NO_APPROVED_BUDGETS" ? (
          <div className="rounded-lg border bg-card p-8 text-center space-y-3" data-testid="materials-field-empty">
            <p className="font-semibold">Todavía no hay necesidades de materiales para esta obra.</p>
            <p className="text-sm text-muted-foreground">
              Aprobá un presupuesto con APU de materiales para ver la cobertura.
            </p>
          </div>
        ) : (
          <MaterialsFieldExperience
            projectId={projectId}
            rows={rows}
            canRequest={canRequest}
            queryMs={queryMs}
          />
        )}
      </PageShell>
    );
  }

  const availableBudgets = await listApprovedBudgetsForProject(projectId, ctx).catch((err) => {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  });

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="space-y-3">
        <ProjectPageHeader
          title="Materiales del proyecto"
          subtitle="Cantidades APU vs pedido, recibido y consumido. El control de $ está en EDT y costos."
        />

        <MaterialsToolbar
          mode="desktop"
          projectId={projectId}
          tab={tab}
          operativoHref={`/proyectos/${projectId}/materiales${materialsQuery({
            window,
            budgetId: sp.budgetId,
            wbsNodeId: sp.wbsNodeId,
          })}`}
          varianzaHref={`/proyectos/${projectId}/materiales${materialsQuery({
            tab: "varianza",
            budgetId: sp.budgetId,
            dateFrom: sp.dateFrom,
            dateTo: sp.dateTo,
          })}`}
        showExport={tab === "varianza"}
        exportParams={{
          budgetId: sp.budgetId,
          dateFrom: sp.dateFrom,
          dateTo: sp.dateTo,
        }}
          showCompras={showCompras}
          showConsumos={showConsumos}
        />
      </div>

      {tab === "operativo" ? (
        <OperativoTab
          projectId={projectId}
          window={window}
          budgetId={sp.budgetId}
          wbsNodeId={sp.wbsNodeId}
          availableBudgets={availableBudgets}
          canRequest={canRequest}
          ctx={ctx}
        />
      ) : (
        <VarianzaTab
          projectId={projectId}
          sp={sp}
          availableBudgets={availableBudgets}
          ctx={ctx}
        />
      )}
    </PageShell>
  );
}

async function OperativoTab({
  projectId,
  window,
  budgetId,
  wbsNodeId,
  availableBudgets,
  canRequest,
  ctx,
}: {
  projectId: string;
  window: MaterialsBoardWindow;
  budgetId?: string;
  wbsNodeId?: string;
  availableBudgets: AvailableBudget[];
  canRequest: boolean;
  ctx: ServiceContext;
}) {
  let board;
  try { board = await getProjectMaterialsBoard(projectId, { window, budgetId, wbsNodeId }, ctx); }
  catch (error) { return planningReadError(error, `/proyectos/${projectId}/materiales`); }

  if (board.type === "NO_APPROVED_BUDGETS") {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-3">
        <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
        <p className="text-sm text-muted-foreground">
          Aprobá un presupuesto con APU de materiales para ver la cobertura.
        </p>
        <Button asChild>
          <Link href={`/proyectos/${projectId}/presupuestos`}>Ir a presupuestos</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2" aria-label="Ventana de cronograma">
        {WINDOWS.map((w) => (
          <Button key={w} size="sm" variant={w === window ? "default" : "outline"} asChild>
            <Link
              href={`/proyectos/${projectId}/materiales${materialsQuery({
                window: w,
                budgetId,
                wbsNodeId,
              })}`}
            >
              {windowLabel(w)}
            </Link>
          </Button>
        ))}
      </div>

      {availableBudgets.length > 1 ? (
        <ReportDateFilters
          budgets={availableBudgets}
          currentBudgetId={budgetId}
          showDateRange={false}
        />
      ) : null}

      {board.warnings.map((w, i) => (
        <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
          {w}
        </p>
      ))}

      <p className="text-xs text-muted-foreground">
        Presupuesto: {board.budgetName} · Moneda: {board.currency}
        {board.windowStart && board.windowEnd
          ? ` · Ventana ${board.windowStart} → ${board.windowEnd}`
          : null}
        . Real de obra (libro) ≠ certificado al cliente.
      </p>

      <KpiStatGrid title={null} columns={4}>
        <KpiStatCard
          label={`Presupuesto MAT (${board.currency})`}
          value={formatMoneyAmount(board.totals.needCost, board.currency)}
        />
        <KpiStatCard label="Filas con faltante" value={String(board.totals.shortfallRows)} />
        <KpiStatCard label="Filas con recepción" value={String(board.rows.filter((row) => compareDecimal(row.receivedQty, "0") > 0).length)} />
        <KpiStatCard label="Filas con consumo" value={String(board.rows.filter((row) => compareDecimal(row.consumedQty, "0") > 0).length)} />
      </KpiStatGrid>

      <Card data-testid="materials-desktop-view">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cobertura por partida</CardTitle>
        </CardHeader>
        <CardContent>
          <MaterialsBoardTable
            rows={board.rows}
            currency={board.currency}
            projectId={projectId}
            canRequest={canRequest}
            budgetId={board.budgetId}
          />
        </CardContent>
      </Card>
    </>
  );
}

async function VarianzaTab({
  projectId,
  sp,
  availableBudgets,
  ctx,
}: {
  projectId: string;
  sp: { budgetId?: string; dateFrom?: string; dateTo?: string };
  availableBudgets: AvailableBudget[];
  ctx: ServiceContext;
}) {
  let report;
  try { report = await getMaterialVarianceReport(projectId, { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo }, ctx); }
  catch (error) { return planningReadError(error, `/proyectos/${projectId}/materiales?tab=varianza`); }
  let withoutProduct: Awaited<ReturnType<typeof getMaterialLinesWithoutProduct>> = [];
  if (report.type === "REPORT") {
    try { withoutProduct = await getMaterialLinesWithoutProduct(projectId, report.budgetId, ctx); }
    catch (error) { return planningReadError(error, `/proyectos/${projectId}/materiales?tab=varianza`); }
  }

  if (report.type === "NO_APPROVED_BUDGETS") {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-3">
        <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
        <p className="text-sm text-muted-foreground">
          La varianza en $ requiere un presupuesto aprobado con materiales.
        </p>
        <Button asChild>
          <Link href={`/proyectos/${projectId}/presupuestos`}>Ir a presupuestos</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <ReportDateFilters budgets={availableBudgets} currentBudgetId={sp.budgetId} />
      {report.warnings.map((w, i) => (
        <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
          {w}
        </p>
      ))}
      <KpiStatGrid title={null} columns={3}>
        <KpiStatCard
          label={`Presupuesto material (${report.currency})`}
          value={formatMoneyAmount(report.totals.budgetMaterial, report.currency)}
        />
        <KpiStatCard
          label="Consumo de inventario"
          value={formatMoneyDisplay(report.totals.consumedCost, report.currency)}
          subtitle={report.totals.consumedCost == null ? "Sin valuación" : undefined}
        />
        <KpiStatCard
          label="Variación"
          value={formatMoneyDisplay(report.totals.variance, report.currency)}
          subtitle={report.totals.variance == null ? "No calculable sin valuación del consumo" : undefined}
        />
      </KpiStatGrid>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por partida EDT</CardTitle>
        </CardHeader>
        <CardContent>
          <MaterialWbsTable rows={report.byWbs} currency={report.currency} />
        </CardContent>
      </Card>
      {withoutProduct.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">APU material sin producto</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <p className="text-muted-foreground">
              Vinculá productos en el presupuesto para mejorar el matching de compras y
              consumos.
            </p>
            {withoutProduct.slice(0, 20).map((l) => (
              <p key={l.costAnalysisLineId}>
                <span className="font-mono">{l.wbsCode}</span> — {l.description} (
                {formatDecimalArFromString(l.totalCost)})
              </p>
            ))}
            {withoutProduct.length > 20 ? (
              <p className="text-muted-foreground">… y {withoutProduct.length - 20} más</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
