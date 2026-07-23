import { Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  aggregateCorporatePayableBalances,
  countCorporateDraftInvoices,
  fetchCorporatePayableSnapshotRows,
  type CorporatePayableSnapshotRow,
} from "../ap/corporate-ap-snapshot";
import { canViewCompanyAp } from "../ap/ap-access";
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
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { getTreasurySummaryByTenant } from "../treasury/balance.service";
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
export const POSICION_CAJA_HREF = "/tesoreria";

const ZERO = new Prisma.Decimal(0);

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

export function treasuryBalanceMap(
  accounts: Awaited<ReturnType<typeof getTreasurySummaryByTenant>>,
): Map<string, Prisma.Decimal> {
  const m = new Map<string, Prisma.Decimal>();
  for (const acc of accounts) {
    const bal = new Prisma.Decimal(acc.balance);
    m.set(acc.currency, (m.get(acc.currency) ?? ZERO).add(bal));
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

/** Corporate AR/AP/treasury KPIs shared by hub and transacciones overview. */
export async function buildFinanceCorporateKpis(
  ctx: ServiceContext,
  access: FinanceCorporateKpiInput,
): Promise<FinanceCorporateKpiResult> {
  const kpis: DashboardKpi[] = [];
  const alerts: FinanceCorporateAlert[] = [];
  const currenciesSeen = new Set<string>();
  let corporatePayables: CorporatePayableSnapshotRow[] | null = null;

  if (access.canTreasury) {
    try {
      const accounts = await getTreasurySummaryByTenant(ctx);
      const byCur = treasuryBalanceMap(accounts);
      for (const c of byCur.keys()) currenciesSeen.add(c);
      pushMoneyKpi(kpis, "tr_cash", "Saldo en cuentas", byCur, POSICION_CAJA_HREF);
      try {
        const attribution = await getTreasuryAttributionSummary(ctx);
        kpis.push(...buildTreasuryAttributionKpis(attribution));
      } catch {
        pushUniqueFinanceAlert(alerts, {
          variant: "info",
          message: "No se pudo cargar el desglose de caja por obra vs corporativo.",
        });
      }
    } catch {
      kpis.push({
        key: "tr_cash",
        label: "Saldo en cuentas",
        value: "—",
        href: POSICION_CAJA_HREF,
        tone: "muted",
      });
      pushUniqueFinanceAlert(alerts, {
        variant: "info",
        message: "No se pudo cargar el saldo de tesorería.",
      });
    }
  }

  if (access.canAp) {
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
        pushUniqueFinanceAlert(alerts, {
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
      pushUniqueFinanceAlert(alerts, {
        variant: "info",
        message: "No se pudieron cargar los indicadores de cuentas por pagar corporativas.",
      });
    }
  }

  if (access.canAr) {
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
        pushUniqueFinanceAlert(alerts, {
          variant: "warning",
          message: "Hay cuentas por cobrar vencidas pendientes de cobro.",
        });
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

  return { kpis, alerts, currenciesSeen, corporatePayables };
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
    canTreasury: gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY"),
    canAp: gate.isEnabled("AP") && canViewCompanyAp(ctx.roles),
    canAr: gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR"),
  };
}
