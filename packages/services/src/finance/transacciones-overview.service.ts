import { Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  aggregateCorporatePayableBalances,
  countCorporateDraftInvoices,
  fetchCorporatePayableSnapshotRows,
} from "../ap/corporate-ap-snapshot";
import { canViewCompanyAp } from "../ap/ap-access";
import {
  aggregateCompanyReceivableBalances,
  fetchCompanyReceivableSnapshotRows,
} from "../ar/company-ar-snapshot";
import { fmtDecimalEs, pushMoneyKpi } from "../dashboard/kpi-helpers";
import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import { getCompanyCashProjectionReport } from "../reports/company-cash-projection.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { getTreasurySummaryByCompany } from "../treasury/balance.service";
import type { ServiceContext } from "../types";

export type TransaccionesAlert = {
  variant: "info" | "warning";
  message: string;
};

export type TransaccionesProjectionSummary = {
  dateFrom: string;
  dateTo: string;
  rows: {
    currency: string;
    cashBalance: string;
    expectedOutflows90d: string;
    projectedBalance: string;
    isNegative: boolean;
    openPayableCount: number;
  }[];
  href: string;
  moduleWarnings: string[];
};

export type TransaccionesOverview = {
  visible: boolean;
  kpis: DashboardKpi[];
  alerts: TransaccionesAlert[];
  projection: TransaccionesProjectionSummary | null;
};

const ZERO = new Prisma.Decimal(0);
const CORPORATE_OBLIGATIONS_HREF = "/finanzas/transacciones?tab=obligaciones";
const CORPORATE_OVERDUE_HREF = "/finanzas/transacciones?tab=obligaciones&status=OVERDUE";
const COMPANY_AR_AGING_HREF = "/finanzas/cuentas-por-cobrar-aging";

function pushUniqueAlert(alerts: TransaccionesAlert[], alert: TransaccionesAlert): void {
  if (!alerts.some((a) => a.message === alert.message)) alerts.push(alert);
}

function moneyMapFromRows(rows: { currency: string; amount: string }[]): Map<string, Prisma.Decimal> {
  const m = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    m.set(r.currency, new Prisma.Decimal(r.amount));
  }
  return m;
}

function treasuryBalanceMap(
  accounts: Awaited<ReturnType<typeof getTreasurySummaryByCompany>>,
): Map<string, Prisma.Decimal> {
  const m = new Map<string, Prisma.Decimal>();
  for (const acc of accounts) {
    const bal = new Prisma.Decimal(acc.balance);
    m.set(acc.currency, (m.get(acc.currency) ?? ZERO).add(bal));
  }
  return m;
}

/** KPIs, alertas y proyección corporativa para `/finanzas/transacciones` (reutiliza servicios existentes). */
export async function getTransaccionesOverview(ctx: ServiceContext): Promise<TransaccionesOverview> {
  const gate = await getTenantModuleGate(ctx);
  const canTreasury = gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY");
  const canAp = gate.isEnabled("AP") && canViewCompanyAp(ctx.roles);
  const canAr = gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR");

  if (!canTreasury && !canAp) {
    return { visible: false, kpis: [], alerts: [], projection: null };
  }

  const kpis: DashboardKpi[] = [];
  const alerts: TransaccionesAlert[] = [];
  let projection: TransaccionesProjectionSummary | null = null;

  const currenciesSeen = new Set<string>();
  let corporatePayables: Awaited<ReturnType<typeof fetchCorporatePayableSnapshotRows>> | null = null;

  if (canTreasury) {
    try {
      const accounts = await getTreasurySummaryByCompany(ctx);
      const byCur = treasuryBalanceMap(accounts);
      for (const c of byCur.keys()) currenciesSeen.add(c);
      pushMoneyKpi(kpis, "tr_cash", "Posición de caja", byCur, "/tesoreria/reportes/posicion-caja");
    } catch {
      kpis.push({
        key: "tr_cash",
        label: "Posición de caja",
        value: "—",
        href: "/tesoreria/reportes/posicion-caja",
        tone: "muted",
      });
      pushUniqueAlert(alerts, {
        variant: "info",
        message: "No se pudo cargar la posición de caja.",
      });
    }
  }

  if (canAp) {
    try {
      corporatePayables = await fetchCorporatePayableSnapshotRows(ctx);
      const summary = aggregateCorporatePayableBalances(corporatePayables);
      const openMap = moneyMapFromRows(summary.totalByCurrency);
      const overdueMap = moneyMapFromRows(summary.overdueByCurrency);
      for (const c of openMap.keys()) currenciesSeen.add(c);
      for (const c of overdueMap.keys()) currenciesSeen.add(c);

      pushMoneyKpi(kpis, "tr_ap_open", "C×P corporativas", openMap, CORPORATE_OBLIGATIONS_HREF);
      const openKpi = kpis.find((k) => k.key === "tr_ap_open");
      if (openKpi) openKpi.helper = "Saldo total abierto (sin límite de vencimiento)";

      pushMoneyKpi(
        kpis,
        "tr_ap_overdue",
        "C×P vencidas",
        overdueMap,
        CORPORATE_OVERDUE_HREF,
        "Sin vencidas",
      );
      const overdueKpi = kpis.find((k) => k.key === "tr_ap_overdue");
      if (overdueKpi) {
        if (overdueKpi.value !== "Sin vencidas" && overdueKpi.value !== "—") {
          overdueKpi.tone = "warning";
        }
        overdueKpi.helper = "Vencidas a la fecha (día calendario UTC)";
      }

      if (summary.overdueByCurrency.length > 0) {
        pushUniqueAlert(alerts, {
          variant: "warning",
          message: "Hay obligaciones corporativas vencidas pendientes de pago.",
        });
      }

      const draftInvoiceCount = await countCorporateDraftInvoices(ctx);
      if (draftInvoiceCount > 0) {
        kpis.push({
          key: "tr_draft_invoices",
          label: "Facturas borrador",
          value: String(draftInvoiceCount),
          href: "/finanzas/facturas-proveedor?status=DRAFT",
          tone: "warning",
        });
      }
    } catch {
      pushUniqueAlert(alerts, {
        variant: "info",
        message: "No se pudieron cargar los indicadores de cuentas por pagar corporativas.",
      });
    }
  }

  if (canAr) {
    try {
      const companyReceivables = await fetchCompanyReceivableSnapshotRows(ctx);
      const arSummary = aggregateCompanyReceivableBalances(companyReceivables);
      const arOpenMap = moneyMapFromRows(arSummary.totalByCurrency);
      const arOverdueMap = moneyMapFromRows(arSummary.overdueByCurrency);
      for (const c of arOpenMap.keys()) currenciesSeen.add(c);
      for (const c of arOverdueMap.keys()) currenciesSeen.add(c);

      pushMoneyKpi(kpis, "tr_ar_open", "C×C abiertas", arOpenMap, COMPANY_AR_AGING_HREF);
      const arOpenKpi = kpis.find((k) => k.key === "tr_ar_open");
      if (arOpenKpi) arOpenKpi.helper = "Saldo total abierto (todas las obras)";

      pushMoneyKpi(
        kpis,
        "tr_ar_overdue",
        "C×C vencidas",
        arOverdueMap,
        COMPANY_AR_AGING_HREF,
        "Sin vencidas",
      );
      const arOverdueKpi = kpis.find((k) => k.key === "tr_ar_overdue");
      if (arOverdueKpi) {
        if (arOverdueKpi.value !== "Sin vencidas" && arOverdueKpi.value !== "—") {
          arOverdueKpi.tone = "warning";
        }
        arOverdueKpi.helper = "Vencidas a la fecha (día calendario UTC)";
      }

      if (arSummary.overdueByCurrency.length > 0) {
        pushUniqueAlert(alerts, {
          variant: "warning",
          message: "Hay cuentas por cobrar vencidas pendientes de cobro.",
        });
      }
    } catch {
      pushUniqueAlert(alerts, {
        variant: "info",
        message: "No se pudieron cargar los indicadores de cuentas por cobrar.",
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

  if (canTreasury || canAp) {
    try {
      const proj = await getCompanyCashProjectionReport(ctx, {
        payableRows: corporatePayables ?? undefined,
      });
      projection = {
        dateFrom: proj.dateFrom,
        dateTo: proj.dateTo,
        rows: proj.rows.map((r) => ({
          currency: r.currency,
          cashBalance: r.cashBalance,
          expectedOutflows90d: r.expectedOutflows90d,
          projectedBalance: r.projectedBalance,
          isNegative: r.isNegative,
          openPayableCount: r.openPayableCount,
        })),
        href: CORPORATE_OBLIGATIONS_HREF,
        moduleWarnings: proj.warnings.filter((w) => w.includes("no disponible")),
      };

      for (const w of projection.moduleWarnings) {
        pushUniqueAlert(alerts, { variant: "info", message: w });
      }

      for (const row of proj.rows) {
        const cash = new Prisma.Decimal(row.cashBalance);
        if (cash.lessThan(0)) {
          pushUniqueAlert(alerts, {
            variant: "warning",
            message: `Saldo de caja negativo en ${row.currency} (${fmtDecimalEs(row.cashBalance, row.currency)}).`,
          });
        }
        if (row.isNegative) {
          pushUniqueAlert(alerts, {
            variant: "warning",
            message: `Saldo proyectado negativo en ${row.currency} (${fmtDecimalEs(row.projectedBalance, row.currency)}) dentro de los próximos 90 días según C×P corporativas pendientes.`,
          });
        }
      }
    } catch {
      projection = null;
      pushUniqueAlert(alerts, {
        variant: "info",
        message: "No se pudo calcular la proyección de liquidez.",
      });
    }
  }

  return { visible: true, kpis, alerts, projection };
}
