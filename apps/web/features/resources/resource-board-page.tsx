import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  canEditPurchaseRequests,
  canViewPurchaseRequests,
  getProjectCostControl,
  getProjectResourceBoard,
  getProjectShellInfo,
  getResourceVarianceReport,
  getTenantModuleGate,
  ServiceError,
  type AvailableBudget,
  type ResourceBoardWindow,
  type ServiceContext,
} from "@bloqer/services";
import {
  RESOURCE_BOARD_LABELS_ES,
  RESOURCE_BOARD_ROUTE_SEGMENT,
  type ResourceBoardCategory,
} from "@bloqer/services/resource-board-pure";
import { toResourceFieldRow } from "@bloqer/services/resource-field";
import { ResourceBoardTable } from "./resource-board-table";
import { ResourceFieldExperience } from "./resource-field-experience";
import { ResourceToolbar } from "./resource-toolbar";
import { ResourceWbsVarianceTable } from "./resource-wbs-variance-table";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { ReportDateFilters } from "@/features/reports";
import { formatMoneyAmount } from "@/lib/format-money";
import { isMaterialsFieldViewport, parseViewportHint, VIEWPORT_COOKIE } from "@/lib/viewport-hint-cookie";

const WINDOWS: ResourceBoardWindow[] = ["this_week", "next_14_days", "month", "all"];

function windowLabel(w: ResourceBoardWindow): string {
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

function boardQuery(
  costCategory: ResourceBoardCategory,
  opts: {
    tab?: "operativo" | "varianza";
    window?: ResourceBoardWindow;
    budgetId?: string;
    wbsNodeId?: string;
    dateFrom?: string;
    dateTo?: string;
  },
): string {
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

function basePath(projectId: string, costCategory: ResourceBoardCategory): string {
  return `/proyectos/${projectId}/${RESOURCE_BOARD_ROUTE_SEGMENT[costCategory]}`;
}

export async function ResourceBoardPage({
  costCategory,
  projectId,
  searchParams,
}: {
  costCategory: ResourceBoardCategory;
  projectId: string;
  searchParams: {
    tab?: string;
    window?: string;
    budgetId?: string;
    dateFrom?: string;
    dateTo?: string;
    wbsNodeId?: string;
  };
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const label = RESOURCE_BOARD_LABELS_ES[costCategory];
  const tab = searchParams.tab === "varianza" ? "varianza" : "operativo";
  const window = (WINDOWS.includes(searchParams.window as ResourceBoardWindow)
    ? searchParams.window
    : "next_14_days") as ResourceBoardWindow;

  const ctx: ServiceContext = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const hint = parseViewportHint((await cookies()).get(VIEWPORT_COOKIE)?.value);
  const loadField = isMaterialsFieldViewport(hint);

  const gate = await getTenantModuleGate(ctx);
  const canRequest = gate.isEnabled("PROCUREMENT") && canEditPurchaseRequests(ctx.roles);
  const showCompras =
    gate.isEnabled("PROCUREMENT") &&
    (canViewPurchaseRequests(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));
  const canInvoice = gate.isEnabled("AP") && can(ctx.roles, "EDIT", "AP");
  const showInvoices = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  const root = basePath(projectId, costCategory);

  if (loadField) {
    let board;
    try {
      board = await getProjectResourceBoard(
        projectId,
        costCategory,
        { window: "all", budgetId: searchParams.budgetId },
        ctx,
      );
    } catch (err) {
      if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
      throw err;
    }
    const rows = board.type === "REPORT" ? board.rows.map(toResourceFieldRow) : [];
    return (
      <PageShell variant="default" className="space-y-6">
        <div className="space-y-3">
          <ProjectPageHeader title={label} subtitle="Necesidad, pedido y facturación tipada" />
          <ResourceToolbar
            mode="field"
            projectId={projectId}
            costCategory={costCategory}
            showCompras={showCompras}
            showInvoices={showInvoices}
          />
        </div>
        {board.type === "NO_APPROVED_BUDGETS" ? (
          <div className="rounded-lg border bg-card p-8 text-center space-y-3">
            <p className="font-semibold">Todavía no hay necesidades de {label.toLowerCase()}.</p>
            <p className="text-sm text-muted-foreground">
              Aprobá un presupuesto con APU de este tipo para ver la cobertura.
            </p>
          </div>
        ) : (
          <ResourceFieldExperience
            projectId={projectId}
            costCategory={costCategory}
            rows={rows}
            canRequest={canRequest}
            canInvoice={canInvoice}
          />
        )}
      </PageShell>
    );
  }

  const budgetProbe = await getProjectCostControl(
    projectId,
    { budgetId: searchParams.budgetId },
    ctx,
  ).catch((err) => {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  });
  const availableBudgets =
    budgetProbe.type === "NO_APPROVED_BUDGETS" ? [] : budgetProbe.availableBudgets;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="space-y-3">
        <ProjectPageHeader
          title={label}
          subtitle={`Cantidades APU vs pedido y facturado. El control de $ está en EDT y costos (filtro ${label}).`}
        />
        <ResourceToolbar
          mode="desktop"
          projectId={projectId}
          costCategory={costCategory}
          tab={tab}
          operativoHref={`${root}${boardQuery(costCategory, {
            window,
            budgetId: searchParams.budgetId,
            wbsNodeId: searchParams.wbsNodeId,
          })}`}
          varianzaHref={`${root}${boardQuery(costCategory, {
            tab: "varianza",
            budgetId: searchParams.budgetId,
            dateFrom: searchParams.dateFrom,
            dateTo: searchParams.dateTo,
          })}`}
          showExport={tab === "varianza"}
          exportParams={{
            budgetId: searchParams.budgetId,
            dateFrom: searchParams.dateFrom,
            dateTo: searchParams.dateTo,
          }}
          showCompras={showCompras}
          showInvoices={showInvoices}
        />
      </div>

      {tab === "operativo" ? (
        <OperativoTab
          projectId={projectId}
          costCategory={costCategory}
          window={window}
          budgetId={searchParams.budgetId}
          wbsNodeId={searchParams.wbsNodeId}
          availableBudgets={availableBudgets}
          canRequest={canRequest}
          canInvoice={canInvoice}
          ctx={ctx}
        />
      ) : (
        <VarianzaTab
          projectId={projectId}
          costCategory={costCategory}
          sp={searchParams}
          availableBudgets={availableBudgets}
          ctx={ctx}
        />
      )}
    </PageShell>
  );
}

async function OperativoTab({
  projectId,
  costCategory,
  window,
  budgetId,
  wbsNodeId,
  availableBudgets,
  canRequest,
  canInvoice,
  ctx,
}: {
  projectId: string;
  costCategory: ResourceBoardCategory;
  window: ResourceBoardWindow;
  budgetId?: string;
  wbsNodeId?: string;
  availableBudgets: AvailableBudget[];
  canRequest: boolean;
  canInvoice: boolean;
  ctx: ServiceContext;
}) {
  const label = RESOURCE_BOARD_LABELS_ES[costCategory];
  const root = basePath(projectId, costCategory);
  const board = await getProjectResourceBoard(
    projectId,
    costCategory,
    { window, budgetId, wbsNodeId },
    ctx,
  );

  if (board.type === "NO_APPROVED_BUDGETS") {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-3">
        <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
        <p className="text-sm text-muted-foreground">
          Aprobá un presupuesto con APU de {label.toLowerCase()} para ver la cobertura.
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
              href={`${root}${boardQuery(costCategory, {
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
        . Pedí por SC/OC o registrá factura tipada — el $ se ve en EDT.
      </p>

      <KpiStatGrid title={null} columns={4}>
        <KpiStatCard
          label={`Presupuesto ${costCategory === "LABOR" ? "MO" : "EQ"}`}
          value={formatMoneyAmount(board.totals.needCost, "ARS")}
        />
        <KpiStatCard label="Filas con faltante" value={String(board.totals.shortfallRows)} />
        <KpiStatCard label="Cant. pedida" value={fmtQtyKpi(board.totals.orderedQty)} />
        <KpiStatCard label="Cant. facturada" value={fmtQtyKpi(board.totals.invoicedQty)} />
      </KpiStatGrid>

      <Card data-testid="resource-desktop-view">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cobertura APU</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ResourceBoardTable
            rows={board.rows}
            projectId={projectId}
            costCategory={costCategory}
            canRequest={canRequest}
            canInvoice={canInvoice}
          />
        </CardContent>
      </Card>
    </>
  );
}

async function VarianzaTab({
  projectId,
  costCategory,
  sp,
  availableBudgets,
  ctx,
}: {
  projectId: string;
  costCategory: ResourceBoardCategory;
  sp: { budgetId?: string; dateFrom?: string; dateTo?: string };
  availableBudgets: AvailableBudget[];
  ctx: ServiceContext;
}) {
  const report = await getResourceVarianceReport(
    projectId,
    costCategory,
    { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo },
    ctx,
  );

  if (report.type === "NO_APPROVED_BUDGETS") {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-3">
        <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
        <Button asChild>
          <Link href={`/proyectos/${projectId}/presupuestos`}>Ir a presupuestos</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      {availableBudgets.length > 0 ? (
        <ReportDateFilters
          budgets={availableBudgets}
          currentBudgetId={sp.budgetId}
        />
      ) : null}

      {report.warnings.map((w, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          {w}
        </p>
      ))}

      <KpiStatGrid title={null} columns={3}>
        <KpiStatCard
          label="Presupuesto"
          value={formatMoneyAmount(report.totals.budgetCost, "ARS")}
        />
        <KpiStatCard
          label="Facturado"
          value={formatMoneyAmount(report.totals.accruedCost, "ARS")}
        />
        <KpiStatCard
          label="Variación"
          value={formatMoneyAmount(report.totals.variance, "ARS")}
        />
      </KpiStatGrid>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por partida</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ResourceWbsVarianceTable rows={report.byWbs} />
        </CardContent>
      </Card>
    </>
  );
}
