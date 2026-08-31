import { Prisma } from "@bloqer/database";
import {
  aggregateCorporatePayableBalances,
  aggregateCorporateProjectionOutflows,
  countCorporateDraftInvoices,
  fetchCorporatePayableSnapshotRows,
  type CorporatePayableSnapshotRow,
} from "../ap/corporate-ap-snapshot";
import { canViewCompanyAp } from "../ap/ap-access";
import { canViewCompanyAr } from "../ar/ar-access";
import { canViewCompanyTreasury } from "./finance-access";
import {
  aggregateCompanyReceivableBalances,
  fetchCompanyReceivableSnapshotRows,
} from "../ar/company-ar-snapshot";
import {
  buildTreasuryAttributionKpis,
  getTreasuryAttributionSummary,
} from "../treasury/treasury-attribution.service";
import { fmtDecimalEs, pushMoneyKpi } from "../dashboard/kpi-helpers";
import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import { getCompanyCashProjectionReport } from "../reports/company-cash-projection.service";
import { projectionHorizon } from "../reports/report-month";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";

export type FinanceCorporateAlert = {
  variant: "info" | "warning";
  message: string;
};

/** Shared alert shape for hub and transacciones panels. */
export type FinanceOperationalAlert = FinanceCorporateAlert;

export type FinanceProjectionSummary = {
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

export const CORPORATE_OBLIGATIONS_HREF = "/finanzas/cuentas-por-pagar";
export const CORPORATE_OVERDUE_HREF = "/finanzas/cuentas-por-pagar?status=OVERDUE";
export const COMPANY_AR_AGING_HREF = "/finanzas/cuentas-por-cobrar";
export const DRAFT_INVOICES_HREF = "/finanzas/facturas-proveedor?status=DRAFT";

export function pushUniqueFinanceAlert(
  alerts: FinanceCorporateAlert[],
  alert: FinanceCorporateAlert,
): void {
  if (!alerts.some((a) => a.message === alert.message)) alerts.push(alert);
}

export function moneyMapFromRows(rows: { currency: string; amount: string }[]): Map<string, Prisma.Decimal> {
  const m = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    m.set(r.currency, new Prisma.Decimal(r.amount));
  }
  return m;
}

export type FinanceCorporateKpiInput = {
  canTreasury: boolean;
  canAp: boolean;
  canAr: boolean;
};

export type FinanceCorporateKpiResult = {
  kpis: DashboardKpi[];
  alerts: FinanceCorporateAlert[];
  currenciesSeen: Set<string>;
  corporatePayables: CorporatePayableSnapshotRow[] | null;
};

/**
 * Company-finance KPIs for `/finanzas` and transacciones overview.
 * Layout (4+4 when AR+AP+attribution available): empresa ops → CxP/CxC.
 * Does **not** duplicate Tesorería hub cards (saldo / ingresos-egresos del mes).
 */
export async function buildFinanceCorporateKpis(
  ctx: ServiceContext,
  access: FinanceCorporateKpiInput,
): Promise<FinanceCorporateKpiResult> {
  const alerts: FinanceCorporateAlert[] = [];
  const currenciesSeen = new Set<string>();
  let corporatePayables: CorporatePayableSnapshotRow[] | null = null;

  const row1: DashboardKpi[] = [];
  const row2: DashboardKpi[] = [];

  // ── Fila 1: atribución obra/corp (tesorería VIEW, sin “Saldo en cuentas”) ──
  if (access.canTreasury) {
    try {
      const attribution = await getTreasuryAttributionSummary(ctx);
      // includeEmpty: keep two slots so the hub stays 4+4 even with no movements yet
      row1.push(...buildTreasuryAttributionKpis(attribution, { includeEmpty: true }));
      for (const row of attribution.byCurrency) {
        currenciesSeen.add(row.currency);
      }
    } catch {
      pushUniqueFinanceAlert(alerts, {
        variant: "info",
        message: "No se pudo cargar el desglose de caja por obra vs corporativo.",
      });
    }
  }

  // ── AP snapshot: compute first, then push (no fake zeros on failure) ──
  if (access.canAp) {
    try {
      corporatePayables = await fetchCorporatePayableSnapshotRows(ctx);
      const summary = aggregateCorporatePayableBalances(corporatePayables);
      const openMap = moneyMapFromRows(summary.totalByCurrency);
      const overdueMap = moneyMapFromRows(summary.overdueByCurrency);
      for (const c of openMap.keys()) currenciesSeen.add(c);
      for (const c of overdueMap.keys()) currenciesSeen.add(c);

      let draftInvoiceCount = 0;
      let draftCountFailed = false;
      try {
        draftInvoiceCount = await countCorporateDraftInvoices(ctx);
      } catch {
        draftCountFailed = true;
        pushUniqueFinanceAlert(alerts, {
          variant: "info",
          message: "No se pudo cargar el conteo de facturas en borrador.",
        });
      }

      const expectedOutflows90d = new Map<string, Prisma.Decimal>();
      const horizon = projectionHorizon(90);
      for (const slice of aggregateCorporateProjectionOutflows(corporatePayables, horizon.dateTo)) {
        if (slice.expectedOutflows.greaterThan(0)) {
          expectedOutflows90d.set(slice.currency, slice.expectedOutflows);
          currenciesSeen.add(slice.currency);
        }
      }

      // Fila 1: borrador + pagos esperados 90d (solo si el snapshot AP cargó)
      row1.push({
        key: "tr_draft_invoices",
        label: "Facturas borrador",
        value: draftCountFailed ? "—" : String(draftInvoiceCount),
        href: DRAFT_INVOICES_HREF,
        tone: draftCountFailed ? "muted" : draftInvoiceCount > 0 ? "warning" : "muted",
        helper: "Facturas de proveedor en borrador (empresa)",
      });

      pushMoneyKpi(
        row1,
        "tr_ap_expected_90d",
        "Pagos esperados (90d)",
        expectedOutflows90d,
        CORPORATE_OBLIGATIONS_HREF,
        "Sin vencimientos",
      );
      const expectedKpi = row1.find((k) => k.key === "tr_ap_expected_90d");
      if (expectedKpi) {
        expectedKpi.helper =
          "C×P corporativas abiertas con vencimiento dentro de 90 días (incluye vencidas)";
      }

      // Fila 2: CxP
      pushMoneyKpi(row2, "tr_ap_open", "C×P corporativas", openMap, CORPORATE_OBLIGATIONS_HREF);
      const openKpi = row2.find((k) => k.key === "tr_ap_open");
      if (openKpi) openKpi.helper = "Saldo total abierto (sin límite de vencimiento)";

      pushMoneyKpi(
        row2,
        "tr_ap_overdue",
        "C×P vencidas",
        overdueMap,
        CORPORATE_OVERDUE_HREF,
        "Sin vencidas",
      );
      const overdueKpi = row2.find((k) => k.key === "tr_ap_overdue");
      if (overdueKpi) {
        if (overdueKpi.value !== "Sin vencidas" && overdueKpi.value !== "—") {
          overdueKpi.tone = "warning";
        }
        overdueKpi.helper = "Vencidas a la fecha (día calendario UTC)";
      }
    } catch {
      corporatePayables = null;
      pushUniqueFinanceAlert(alerts, {
        variant: "info",
        message: "No se pudieron cargar los indicadores de cuentas por pagar corporativas.",
      });
    }
  }

  // ── Fila 2 (continuación): CxC ──
  if (access.canAr) {
    try {
      const companyReceivables = await fetchCompanyReceivableSnapshotRows(ctx);
      const arSummary = aggregateCompanyReceivableBalances(companyReceivables);
      const arOpenMap = moneyMapFromRows(arSummary.totalByCurrency);
      const arOverdueMap = moneyMapFromRows(arSummary.overdueByCurrency);
      for (const c of arOpenMap.keys()) currenciesSeen.add(c);
      for (const c of arOverdueMap.keys()) currenciesSeen.add(c);

      pushMoneyKpi(row2, "tr_ar_open", "C×C abiertas", arOpenMap, COMPANY_AR_AGING_HREF);
      const arOpenKpi = row2.find((k) => k.key === "tr_ar_open");
      if (arOpenKpi) arOpenKpi.helper = "Saldo total abierto (todas las obras)";

      pushMoneyKpi(
        row2,
        "tr_ar_overdue",
        "C×C vencidas",
        arOverdueMap,
        COMPANY_AR_AGING_HREF,
        "Sin vencidas",
      );
      const arOverdueKpi = row2.find((k) => k.key === "tr_ar_overdue");
      if (arOverdueKpi) {
        if (arOverdueKpi.value !== "Sin vencidas" && arOverdueKpi.value !== "—") {
          arOverdueKpi.tone = "warning";
        }
        arOverdueKpi.helper = "Vencidas a la fecha (día calendario UTC)";
      }
    } catch {
      pushUniqueFinanceAlert(alerts, {
        variant: "info",
        message: "No se pudieron cargar los indicadores de cuentas por cobrar.",
      });
    }
  }

  if (currenciesSeen.size > 1) {
    pushUniqueFinanceAlert(alerts, {
      variant: "warning",
      message:
        "Hay más de una moneda activa. Los importes se muestran por moneda; no se suman entre divisas distintas.",
    });
  }

  return {
    kpis: [...row1, ...row2],
    alerts,
    currenciesSeen,
    corporatePayables,
  };
}

export async function buildFinanceProjection(
  ctx: ServiceContext,
  access: Pick<FinanceCorporateKpiInput, "canTreasury" | "canAp">,
  corporatePayables: CorporatePayableSnapshotRow[] | null,
  alerts: FinanceOperationalAlert[],
): Promise<FinanceProjectionSummary | null> {
  if (!access.canTreasury && !access.canAp) return null;

  try {
    const proj = await getCompanyCashProjectionReport(ctx, {
      payableRows: corporatePayables ?? undefined,
    });
    const projection: FinanceProjectionSummary = {
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
      pushUniqueFinanceAlert(alerts, { variant: "info", message: w });
    }

    for (const row of proj.rows) {
      const cash = new Prisma.Decimal(row.cashBalance);
      if (cash.lessThan(0)) {
        pushUniqueFinanceAlert(alerts, {
          variant: "warning",
          message: `Saldo de caja negativo en ${row.currency} (${fmtDecimalEs(row.cashBalance, row.currency)}).`,
        });
      }
      if (row.isNegative) {
        pushUniqueFinanceAlert(alerts, {
          variant: "warning",
          message: `Saldo proyectado negativo en ${row.currency} (${fmtDecimalEs(row.projectedBalance, row.currency)}) dentro de los próximos 90 días según C×P corporativas pendientes.`,
        });
      }
    }

    return projection;
  } catch {
    pushUniqueFinanceAlert(alerts, {
      variant: "info",
      message: "No se pudo calcular la proyección de liquidez.",
    });
    return null;
  }
}

export async function resolveFinanceCorporateAccess(ctx: ServiceContext): Promise<FinanceCorporateKpiInput> {
  const gate = await getTenantModuleGate(ctx);
  return {
    canTreasury: gate.isEnabled("TREASURY") && canViewCompanyTreasury(ctx.roles),
    canAp: gate.isEnabled("AP") && canViewCompanyAp(ctx.roles),
    canAr: gate.isEnabled("AR") && canViewCompanyAr(ctx.roles),
  };
}
