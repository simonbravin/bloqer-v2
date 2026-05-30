import { Prisma } from "@bloqer/database";
import {
  getProjectCostControl,
  type CostControlFilters,
  type CostControlResult,
} from "../cost-control/cost-control.service";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { ServiceContext, ServiceError } from "../types";

export type ProjectWbsProgressRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  progressPct: string;
  budgetTotalCost: string;
  expectedCostExposure: string;
  varianceAmount: string;
  varianceStatus: "favorable" | "unfavorable" | "on_budget";
  href: string;
};

export type ProjectWbsProgressAlerts = {
  nearCompletion: ProjectWbsProgressRow[];
  favorableAtCompletion: ProjectWbsProgressRow[];
  unfavorableAtCompletion: ProjectWbsProgressRow[];
};

export type ProjectWbsProgressResult =
  | ProjectWbsProgressAlerts
  | Extract<CostControlResult, { type: "BUDGET_SELECTION_REQUIRED" }>
  | Extract<CostControlResult, { type: "NO_APPROVED_BUDGETS" }>;

const NEAR_MIN = 85;
const NEAR_MAX = 99.99;
const COMPLETE_MIN = 99.95;

function progressPct(qty: string, budgetQty: string): number | null {
  const b = new Prisma.Decimal(budgetQty);
  if (b.lte(0)) return null;
  return new Prisma.Decimal(qty).div(b).times(100).toNumber();
}

function buildRow(
  projectId: string,
  row: {
    wbsNodeId: string;
    wbsCode: string;
    wbsName: string;
    budgetTotalCost: string;
    expectedCostExposure: string;
    operationalProgressQty: string;
    budgetQty: string;
  },
  pct: number,
): ProjectWbsProgressRow {
  const budget = new Prisma.Decimal(row.budgetTotalCost);
  const expected = new Prisma.Decimal(row.expectedCostExposure);
  const variance = budget.minus(expected);
  let varianceStatus: ProjectWbsProgressRow["varianceStatus"] = "on_budget";
  if (variance.gt(0)) varianceStatus = "favorable";
  else if (variance.lt(0)) varianceStatus = "unfavorable";

  return {
    wbsNodeId: row.wbsNodeId,
    wbsCode: row.wbsCode,
    wbsName: row.wbsName,
    progressPct: pct.toFixed(1),
    budgetTotalCost: row.budgetTotalCost,
    expectedCostExposure: row.expectedCostExposure,
    varianceAmount: variance.toFixed(2),
    varianceStatus,
    href: `/proyectos/${projectId}/control-costos/${row.wbsNodeId}`,
  };
}

export async function getProjectWbsProgressAlerts(
  projectId: string,
  filters: Pick<CostControlFilters, "budgetId">,
  ctx: ServiceContext,
): Promise<ProjectWbsProgressResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para alertas WBS");
  }

  const cc = await getProjectCostControl(projectId, filters, ctx);
  if (cc.type !== "REPORT") return cc;

  const nearCompletion: ProjectWbsProgressRow[] = [];
  const favorableAtCompletion: ProjectWbsProgressRow[] = [];
  const unfavorableAtCompletion: ProjectWbsProgressRow[] = [];

  for (const row of cc.rows) {
    const pct = progressPct(row.operationalProgressQty, row.budgetQty);
    if (pct == null) continue;

    if (pct >= NEAR_MIN && pct <= NEAR_MAX) {
      nearCompletion.push(buildRow(projectId, row, pct));
    }

    if (pct >= COMPLETE_MIN) {
      const built = buildRow(projectId, row, pct);
      if (built.varianceStatus === "favorable") favorableAtCompletion.push(built);
      else if (built.varianceStatus === "unfavorable") unfavorableAtCompletion.push(built);
    }
  }

  nearCompletion.sort((a, b) => parseFloat(b.progressPct) - parseFloat(a.progressPct));
  favorableAtCompletion.sort(
    (a, b) => parseFloat(b.varianceAmount) - parseFloat(a.varianceAmount),
  );
  unfavorableAtCompletion.sort(
    (a, b) => parseFloat(a.varianceAmount) - parseFloat(b.varianceAmount),
  );

  return {
    nearCompletion: nearCompletion.slice(0, 5),
    favorableAtCompletion: favorableAtCompletion.slice(0, 5),
    unfavorableAtCompletion: unfavorableAtCompletion.slice(0, 5),
  };
}
