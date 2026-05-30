import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { pushMoneyKpi } from "../dashboard/kpi-helpers";
import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";

export type TreasuryAttributionByCurrency = {
  currency: string;
  projectOutflows: string;
  corporateOutflows: string;
  projectInflows: string;
  corporateInflows: string;
};

export type TreasuryAttributionSummary = {
  visible: boolean;
  byCurrency: TreasuryAttributionByCurrency[];
};

const ZERO = new Prisma.Decimal(0);
const TREASURY_ATTRIBUTION_HREF = "/tesoreria/reportes/flujo-caja";

/** Desglose de movimientos de caja confirmados: imputados a obra vs corporativos (projectId null).
 *  Con ctx.companyId activo solo incluye movimientos de esa empresa (sin mezclar companyId null). */
export async function getTreasuryAttributionSummary(
  ctx: ServiceContext,
): Promise<TreasuryAttributionSummary> {
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("TREASURY") || !can(ctx.roles, "VIEW", "TREASURY")) {
    return { visible: false, byCurrency: [] };
  }

  const rows = await prisma.accountMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "CONFIRMED",
      type: { in: ["INFLOW", "OUTFLOW"] },
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    },
    select: {
      currency: true,
      amount: true,
      type: true,
      projectId: true,
    },
  });

  type Agg = {
    projectOut: Prisma.Decimal;
    corpOut: Prisma.Decimal;
    projectIn: Prisma.Decimal;
    corpIn: Prisma.Decimal;
  };

  const byCur = new Map<string, Agg>();

  for (const row of rows) {
    const cur = row.currency;
    const agg = byCur.get(cur) ?? {
      projectOut: ZERO,
      corpOut: ZERO,
      projectIn: ZERO,
      corpIn: ZERO,
    };
    const isProject = row.projectId != null;
    if (row.type === "OUTFLOW") {
      if (isProject) agg.projectOut = agg.projectOut.add(row.amount);
      else agg.corpOut = agg.corpOut.add(row.amount);
    } else {
      if (isProject) agg.projectIn = agg.projectIn.add(row.amount);
      else agg.corpIn = agg.corpIn.add(row.amount);
    }
    byCur.set(cur, agg);
  }

  const byCurrency: TreasuryAttributionByCurrency[] = [...byCur.entries()]
    .sort(([a], [b]) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b)))
    .map(([currency, agg]) => ({
      currency,
      projectOutflows: agg.projectOut.toString(),
      corporateOutflows: agg.corpOut.toString(),
      projectInflows: agg.projectIn.toString(),
      corporateInflows: agg.corpIn.toString(),
    }));

  return { visible: byCurrency.length > 0, byCurrency };
}

export function buildTreasuryAttributionKpis(summary: TreasuryAttributionSummary): DashboardKpi[] {
  if (!summary.visible || summary.byCurrency.length === 0) return [];

  const projectOut = new Map<string, Prisma.Decimal>();
  const corpOut = new Map<string, Prisma.Decimal>();

  for (const row of summary.byCurrency) {
    const pOut = new Prisma.Decimal(row.projectOutflows);
    const cOut = new Prisma.Decimal(row.corporateOutflows);
    if (pOut.greaterThan(ZERO)) projectOut.set(row.currency, pOut);
    if (cOut.greaterThan(ZERO)) corpOut.set(row.currency, cOut);
  }

  const kpis: DashboardKpi[] = [];
  pushMoneyKpi(
    kpis,
    "tr_attr_project_out",
    "Egresos imputados a obras",
    projectOut,
    TREASURY_ATTRIBUTION_HREF,
    "Sin egresos",
  );
  const projectKpi = kpis.find((k) => k.key === "tr_attr_project_out");
  if (projectKpi) projectKpi.helper = "Pagos confirmados con projectId (histórico acumulado)";

  pushMoneyKpi(
    kpis,
    "tr_attr_corp_out",
    "Egresos corporativos",
    corpOut,
    TREASURY_ATTRIBUTION_HREF,
    "Sin egresos",
  );
  const corpKpi = kpis.find((k) => k.key === "tr_attr_corp_out");
  if (corpKpi) corpKpi.helper = "Pagos sin imputación a obra (projectId null)";

  return kpis;
}
