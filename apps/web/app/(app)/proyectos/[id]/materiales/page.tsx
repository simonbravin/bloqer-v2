import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  canEditPurchaseRequests,
  canViewPurchaseRequests,
  getMaterialLinesWithoutProduct,
  getMaterialVarianceReport,
  getProjectCostControl,
  getProjectMaterialsBoard,
  getProjectShellInfo,
  getTenantModuleGate,
  ServiceError,
  type AvailableBudget,
  type MaterialsBoardWindow,
  type ServiceContext,
} from "@bloqer/services";
import { MaterialsBoardTable } from "@/features/materials/materials-board-table";
import { MaterialWbsTable, ReportDateFilters, ReportExportActions } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatDecimalArFromString, formatMoneyAmount } from "@/lib/format-money";

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

function fmtQtyKpi(raw: string): string {
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return raw;
  const sign = t.startsWith("-") ? "-" : "";
  const abs = sign ? t.slice(1) : t;
  const [intPart, decPart = ""] = abs.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const trimmedDec = decPart.replace(/0+$/, "").slice(0, 4);
  return trimmedDec ? `${sign}${withThousands},${trimmedDec}` : `${sign}${withThousands}`;
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

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const budgetProbe = await getProjectCostControl(projectId, { budgetId: sp.budgetId }, ctx).catch(
    (err) => {
      if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
      throw err;
    },
  );
  const availableBudgets =
    budgetProbe.type === "NO_APPROVED_BUDGETS" ? [] : budgetProbe.availableBudgets;

  const gate = await getTenantModuleGate(ctx);
  const showCompras =
    gate.isEnabled("PROCUREMENT") &&
    (canViewPurchaseRequests(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));
  const showConsumos = gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");
  const canRequest =
    gate.isEnabled("PROCUREMENT") && canEditPurchaseRequests(ctx.roles);

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Materiales del proyecto"
        subtitle="Necesidad APU vs pedido, recibido y consumido"
        actions={
          <div className="flex flex-wrap gap-2">
            {tab === "varianza" ? (
              <ReportExportActions
                exportPath={`/api/reports/proyectos/${projectId}/materiales.csv`}
                params={sp}
                pdf
              />
            ) : null}
            {showCompras ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/proyectos/${projectId}/compras`}>Tablero de compras</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/proyectos/${projectId}/solicitudes-compra`}>Solicitudes</Link>
                </Button>
              </>
            ) : null}
            {showConsumos ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/proyectos/${projectId}/consumos`}>Consumos</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Vistas de materiales">
        <Button variant={tab === "operativo" ? "default" : "ghost"} size="sm" asChild>
          <Link
            href={`/proyectos/${projectId}/materiales${materialsQuery({
              window,
              budgetId: sp.budgetId,
              wbsNodeId: sp.wbsNodeId,
            })}`}
            role="tab"
            aria-selected={tab === "operativo"}
          >
            Operativo
          </Link>
        </Button>
        <Button variant={tab === "varianza" ? "default" : "ghost"} size="sm" asChild>
          <Link
            href={`/proyectos/${projectId}/materiales${materialsQuery({
              tab: "varianza",
              budgetId: sp.budgetId,
              dateFrom: sp.dateFrom,
              dateTo: sp.dateTo,
            })}`}
            role="tab"
            aria-selected={tab === "varianza"}
          >
            Varianza ($)
          </Link>
        </Button>
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
  const board = await getProjectMaterialsBoard(
    projectId,
    { window, budgetId, wbsNodeId },
    ctx,
  );

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
        Presupuesto: {board.budgetName}
        {board.windowStart && board.windowEnd
          ? ` · Ventana ${board.windowStart} → ${board.windowEnd}`
          : null}
        . Real de obra (libro) ≠ certificado al cliente.
      </p>

      <KpiStatGrid title={null} columns={4}>
        <KpiStatCard
          label="Presupuesto MAT"
          value={formatMoneyAmount(board.totals.needCost, "ARS")}
        />
        <KpiStatCard label="Filas con faltante" value={String(board.totals.shortfallRows)} />
        <KpiStatCard label="Cant. recibida" value={fmtQtyKpi(board.totals.receivedQty)} />
        <KpiStatCard label="Cant. consumida" value={fmtQtyKpi(board.totals.consumedQty)} />
      </KpiStatGrid>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cobertura por partida</CardTitle>
        </CardHeader>
        <CardContent>
          <MaterialsBoardTable rows={board.rows} projectId={projectId} canRequest={canRequest} />
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
  const report = await getMaterialVarianceReport(
    projectId,
    { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo },
    ctx,
  );
  let withoutProduct: Awaited<ReturnType<typeof getMaterialLinesWithoutProduct>> = [];
  if (report.type === "REPORT") {
    withoutProduct = await getMaterialLinesWithoutProduct(projectId, report.budgetId, ctx);
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
          label="Presupuesto material"
          value={formatMoneyAmount(report.totals.budgetMaterial, "ARS")}
        />
        <KpiStatCard
          label="Consumo devengado"
          value={formatMoneyAmount(report.totals.consumedCost, "ARS")}
        />
        <KpiStatCard
          label="Variación"
          value={formatMoneyAmount(report.totals.variance, "ARS")}
        />
      </KpiStatGrid>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por partida WBS</CardTitle>
        </CardHeader>
        <CardContent>
          <MaterialWbsTable rows={report.byWbs} />
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
