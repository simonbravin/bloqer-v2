import { Prisma } from "@bloqer/database";
import { canViewArProjectArea } from "../ar/ar-access";
import { summarizeReceivablesByProject } from "../ar/receivable.service";
import { canViewApProjectArea } from "../ap/ap-access";
import { summarizePayablesByProject } from "../ap/payable.service";
import { pushMoneyKpi } from "../dashboard/kpi-helpers";
import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";

export type ProjectFinanceSnapshotAlert = {
  variant: "info" | "warning";
  message: string;
};

export type ProjectFinanceSnapshot = {
  visible: boolean;
  kpis: DashboardKpi[];
  alerts: ProjectFinanceSnapshotAlert[];
};

function moneyMapFromRows(rows: { currency: string; amount: string }[]): Map<string, Prisma.Decimal> {
  const m = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    m.set(r.currency, new Prisma.Decimal(r.amount));
  }
  return m;
}

function pushUniqueAlert(alerts: ProjectFinanceSnapshotAlert[], alert: ProjectFinanceSnapshotAlert): void {
  if (!alerts.some((a) => a.message === alert.message)) alerts.push(alert);
}

/** KPIs de saldos abiertos/vencidos AR/AP para una obra (flujo de caja, tableros). */
export async function getProjectFinanceSnapshot(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectFinanceSnapshot> {
  const gate = await getTenantModuleGate(ctx);
  const kpis: DashboardKpi[] = [];
  const alerts: ProjectFinanceSnapshotAlert[] = [];
  const currenciesSeen = new Set<string>();
  const base = `/proyectos/${projectId}`;

  const canAr = gate.isEnabled("AR") && canViewArProjectArea(ctx.roles);
  const canAp = gate.isEnabled("AP") && canViewApProjectArea(ctx.roles);

  if (!canAr && !canAp) {
    return { visible: false, kpis: [], alerts: [] };
  }

  if (canAr) {
    try {
      const summary = await summarizeReceivablesByProject(projectId, ctx);
      const openMap = moneyMapFromRows(summary.totalByCurrency);
      const overdueMap = moneyMapFromRows(summary.overdueByCurrency);
      for (const c of openMap.keys()) currenciesSeen.add(c);
      for (const c of overdueMap.keys()) currenciesSeen.add(c);

      pushMoneyKpi(kpis, "pf_ar_open", "C×C abiertas", openMap, `${base}/cuentas-por-cobrar`);
      const openKpi = kpis.find((k) => k.key === "pf_ar_open");
      if (openKpi) openKpi.helper = "Saldo total abierto del proyecto";

      pushMoneyKpi(
        kpis,
        "pf_ar_overdue",
        "C×C vencidas",
        overdueMap,
        `${base}/cuentas-por-cobrar`,
        "Sin vencidas",
      );
      const overdueKpi = kpis.find((k) => k.key === "pf_ar_overdue");
      if (overdueKpi) {
        if (overdueKpi.value !== "Sin vencidas" && overdueKpi.value !== "—") {
          overdueKpi.tone = "warning";
        }
        overdueKpi.helper = "Vencidas a la fecha (día calendario UTC)";
      }

      if (summary.overdueByCurrency.length > 0) {
        pushUniqueAlert(alerts, {
          variant: "warning",
          message: "Hay cuentas por cobrar vencidas en este proyecto.",
        });
      }
    } catch {
      pushUniqueAlert(alerts, {
        variant: "info",
        message: "No se pudieron cargar los indicadores de cuentas por cobrar del proyecto.",
      });
    }
  }

  if (canAp) {
    try {
      const summary = await summarizePayablesByProject(projectId, ctx);
      const openMap = moneyMapFromRows(summary.totalByCurrency);
      const overdueMap = moneyMapFromRows(summary.overdueByCurrency);
      for (const c of openMap.keys()) currenciesSeen.add(c);
      for (const c of overdueMap.keys()) currenciesSeen.add(c);

      pushMoneyKpi(kpis, "pf_ap_open", "C×P abiertas", openMap, `${base}/cuentas-por-pagar`);
      const openKpi = kpis.find((k) => k.key === "pf_ap_open");
      if (openKpi) openKpi.helper = "Saldo total abierto del proyecto";

      pushMoneyKpi(
        kpis,
        "pf_ap_overdue",
        "C×P vencidas",
        overdueMap,
        `${base}/cuentas-por-pagar`,
        "Sin vencidas",
      );
      const overdueKpi = kpis.find((k) => k.key === "pf_ap_overdue");
      if (overdueKpi) {
        if (overdueKpi.value !== "Sin vencidas" && overdueKpi.value !== "—") {
          overdueKpi.tone = "warning";
        }
        overdueKpi.helper = "Vencidas a la fecha (día calendario UTC)";
      }

      if (summary.overdueByCurrency.length > 0) {
        pushUniqueAlert(alerts, {
          variant: "warning",
          message: "Hay cuentas por pagar vencidas en este proyecto.",
        });
      }
    } catch {
      pushUniqueAlert(alerts, {
        variant: "info",
        message: "No se pudieron cargar los indicadores de cuentas por pagar del proyecto.",
      });
    }
  }

  if (currenciesSeen.size > 1) {
    pushUniqueAlert(alerts, {
      variant: "warning",
      message:
        "Hay más de una moneda activa. Los importes se muestran por moneda; no se suman entre divisas distintas.",
    });
  }

  return { visible: kpis.length > 0, kpis, alerts };
}
