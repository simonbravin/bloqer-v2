import { Prisma } from "@bloqer/database";
import { canViewArProjectArea } from "../ar/ar-access";
import {
  summarizeReceivablesByProject,
  type ReceivablesProjectSummary,
} from "../ar/receivable.service";
import { canViewApProjectArea } from "../ap/ap-access";
import {
  summarizePayablesByProject,
  type PayablesProjectSummary,
} from "../ap/payable.service";
import { pushMoneyKpi, pushSignedNetMoneyKpi } from "../dashboard/kpi-helpers";
import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import { getTenantModuleGate, type TenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";
import {
  getProjectAttributedCashBalance,
  type ProjectAttributedCashBalance,
  type ProjectAttributedCashInceptionSource,
} from "./project-attributed-cash.service";

export type ProjectFinanceSnapshotAlert = {
  variant: "info" | "warning";
  message: string;
};

export type ProjectFinanceSnapshotMeta = {
  inceptionDate: string;
  inceptionSource: ProjectAttributedCashInceptionSource;
};

export type ProjectFinanceSnapshotPreload = {
  arSummary?: ReceivablesProjectSummary;
  apSummary?: PayablesProjectSummary;
  attributedCash?: ProjectAttributedCashBalance;
  gate?: TenantModuleGate;
};

export type ProjectFinanceSnapshot = {
  visible: boolean;
  /** Capa deuda comercial (C×C / C×P) */
  obligationKpis: DashboardKpi[];
  /** Capa caja ejecutada imputada desde inicio de obra */
  attributedCashKpis: DashboardKpi[];
  attributedCashMeta: ProjectFinanceSnapshotMeta | null;
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

function attributedCashHelper(meta: ProjectFinanceSnapshotMeta): string {
  const base = `Desde ${meta.inceptionDate} (cobros − pagos confirmados; sin saldo inicial artificial)`;
  if (meta.inceptionSource === "firstMovement") {
    return `${base}. Incluye movimientos anteriores al inicio programado de obra.`;
  }
  return base;
}

/** KPIs de saldos abiertos/vencidos AR/AP y caja imputada acumulada para una obra. */
export async function getProjectFinanceSnapshot(
  projectId: string,
  ctx: ServiceContext,
  preload?: ProjectFinanceSnapshotPreload,
): Promise<ProjectFinanceSnapshot> {
  const gate = preload?.gate ?? (await getTenantModuleGate(ctx));
  const obligationKpis: DashboardKpi[] = [];
  const attributedCashKpis: DashboardKpi[] = [];
  const alerts: ProjectFinanceSnapshotAlert[] = [];
  const currenciesSeen = new Set<string>();
  const base = `/proyectos/${projectId}`;

  const canAr = gate.isEnabled("AR") && canViewArProjectArea(ctx.roles);
  const canAp = gate.isEnabled("AP") && canViewApProjectArea(ctx.roles);
  const canCash = canViewProjectCashFlowReport(ctx.roles);

  let hasNegativeAttributedCash = false;
  let attributedCashMeta: ProjectFinanceSnapshotMeta | null = null;

  if (canCash && (gate.isEnabled("AR") || gate.isEnabled("AP"))) {
    try {
      const attributed =
        preload?.attributedCash ?? (await getProjectAttributedCashBalance(projectId, ctx));
      if (attributed.byCurrency.length > 0) {
        attributedCashMeta = {
          inceptionDate: attributed.inceptionDate,
          inceptionSource: attributed.inceptionSource,
        };
        const netMap = new Map<string, Prisma.Decimal>();
        for (const row of attributed.byCurrency) {
          netMap.set(row.currency, new Prisma.Decimal(row.netBalance));
          currenciesSeen.add(row.currency);
          if (row.isNegative) hasNegativeAttributedCash = true;
        }
        pushSignedNetMoneyKpi(
          attributedCashKpis,
          "pf_cash_net",
          "Caja imputada acumulada",
          netMap,
          `${base}/flujo-caja`,
          "Sin movimientos",
        );
        const cashKpi = attributedCashKpis.find((k) => k.key === "pf_cash_net");
        if (cashKpi && attributedCashMeta) {
          cashKpi.helper = attributedCashHelper(attributedCashMeta);
        }
      }
    } catch {
      pushUniqueAlert(alerts, {
        variant: "info",
        message: "No se pudo calcular la caja imputada acumulada del proyecto.",
      });
    }
  }

  if (canAr) {
    try {
      const summary =
        preload?.arSummary ?? (await summarizeReceivablesByProject(projectId, ctx));
      const openMap = moneyMapFromRows(summary.totalByCurrency);
      const overdueMap = moneyMapFromRows(summary.overdueByCurrency);
      for (const c of openMap.keys()) currenciesSeen.add(c);
      for (const c of overdueMap.keys()) currenciesSeen.add(c);

      pushMoneyKpi(obligationKpis, "pf_ar_open", "C×C abiertas", openMap, `${base}/cuentas-por-cobrar`);
      const openKpi = obligationKpis.find((k) => k.key === "pf_ar_open");
      if (openKpi) openKpi.helper = "Capa deuda comercial — saldo abierto del proyecto";

      pushMoneyKpi(
        obligationKpis,
        "pf_ar_overdue",
        "C×C vencidas",
        overdueMap,
        `${base}/cuentas-por-cobrar`,
        "Sin vencidas",
      );
      const overdueKpi = obligationKpis.find((k) => k.key === "pf_ar_overdue");
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
      const summary =
        preload?.apSummary ?? (await summarizePayablesByProject(projectId, ctx));
      const openMap = moneyMapFromRows(summary.totalByCurrency);
      const overdueMap = moneyMapFromRows(summary.overdueByCurrency);
      for (const c of openMap.keys()) currenciesSeen.add(c);
      for (const c of overdueMap.keys()) currenciesSeen.add(c);

      pushMoneyKpi(obligationKpis, "pf_ap_open", "C×P abiertas", openMap, `${base}/cuentas-por-pagar`);
      const openKpi = obligationKpis.find((k) => k.key === "pf_ap_open");
      if (openKpi) openKpi.helper = "Capa deuda comercial — saldo abierto del proyecto";

      pushMoneyKpi(
        obligationKpis,
        "pf_ap_overdue",
        "C×P vencidas",
        overdueMap,
        `${base}/cuentas-por-pagar`,
        "Sin vencidas",
      );
      const overdueKpi = obligationKpis.find((k) => k.key === "pf_ap_overdue");
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

  if (hasNegativeAttributedCash) {
    pushUniqueAlert(alerts, {
      variant: "warning",
      message:
        "La obra tiene caja imputada negativa: los pagos superan los cobros confirmados. La empresa financia la obra con su caja general.",
    });
  }

  if (currenciesSeen.size > 1) {
    pushUniqueAlert(alerts, {
      variant: "warning",
      message:
        "Hay más de una moneda activa. Los importes se muestran por moneda; no se suman entre divisas distintas.",
    });
  }

  const visible =
    obligationKpis.length > 0 || attributedCashKpis.length > 0 || alerts.length > 0;

  return {
    visible,
    obligationKpis,
    attributedCashKpis,
    attributedCashMeta,
    alerts,
  };
}
