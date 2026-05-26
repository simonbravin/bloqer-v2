import { Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  getPayableAgingReport,
  getReceivableAgingReport,
  type AgingItem,
  type AgingReport,
} from "../aging/aging.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { getTreasurySummaryByCompany } from "../treasury/balance.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import type { CompanyFinanceOperationsSummary } from "./company-finance-operations-summary.service";
import { getCompanyFinanceOperationsSummary } from "./company-finance-operations-summary.service";

const ZERO = new Prisma.Decimal(0);

function fmtDecimalEs(value: string, currencyCode?: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  if (currencyCode) {
    try {
      return new Intl.NumberFormat("es-AR", {
        style:                 "currency",
        currency:              currencyCode,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${value} ${currencyCode}`;
    }
  }
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

function countOverdueFromAgingReport(report: { rows: { items: { daysOverdue: number; balanceDue: string }[] }[] }): number {
  let n = 0;
  for (const row of report.rows) {
    for (const item of row.items) {
      if (item.daysOverdue > 0 && Number(item.balanceDue) > 0) n += 1;
    }
  }
  return n;
}

function safeRun<T>(fn: () => Promise<T>): Promise<T | null> {
  return fn().catch((e: unknown) => {
    if (e instanceof ServiceError) {
      if (e.code === "FORBIDDEN") return null;
    }
    throw e;
  });
}

export type FinanceHubMoneyCard = {
  /** Tenant has AR/AP module enabled */
  moduleEnabled: boolean;
  /** User has VIEW AR / VIEW AP */
  hasPermission: boolean;
  /** Show card body (module on and user can view) */
  visible: boolean;
  /** Raw total balance string when single currency; null if multimoneda or no data */
  totalBalance: string | null;
  /** Headline for the card */
  displayTotal: string;
  currency: string | null;
  multicurrency: boolean;
  overdueLineCount: number;
  agingHref: string;
  /** True when aging call failed or returned null (non-FORBIDDEN errors propagate) */
  loadFailed: boolean;
};

export type FinanceHubTreasuryCard = {
  moduleEnabled: boolean;
  hasPermission: boolean;
  visible: boolean;
  multicurrency: boolean;
  balancesByCurrency: Record<string, string>;
  displayHeadline: string;
  treasuryHref: string;
  reportsHref: string;
  posicionCajaHref: string;
  movimientosHref: string;
  loadFailed: boolean;
};

export type FinanceHubReportLink = {
  label: string;
  description: string;
  href: string;
};

/** Per-currency slice from aging lines (never mixes currencies). */
export type FinanceHubCurrencySnapshot = {
  currency: string;
  openTotal: string;
  overdueTotal: string;
  /** Saldo en bucket “current” del aging (aún no vencido según aging). */
  currentOrNotDueTotal: string;
  openLineCount: number;
  overdueLineCount: number;
  /** 0–1 overdue / open; null when there is no open balance. */
  overdueShareOfOpen: number | null;
};

export type FinanceHubInsightBlock = {
  moduleEnabled: boolean;
  hasPermission: boolean;
  visible: boolean;
  loadFailed: boolean;
  agingHref: string;
  multicurrency: boolean;
  byCurrency: FinanceHubCurrencySnapshot[];
};

export type FinanceHubAccountingSection = {
  moduleEnabled: boolean;
  hasPermission: boolean;
  visible: boolean;
  href: string;
};

export type FinanceHubQuickAction = {
  label: string;
  href: string;
};

export type FinanceHubAlert = {
  variant: "info" | "warning";
  message: string;
};

export type FinanceHubOverview = {
  arCard?: FinanceHubMoneyCard;
  apCard?: FinanceHubMoneyCard;
  treasuryCard?: FinanceHubTreasuryCard;
  /** Phase 16D — aging AR breakdown by currency + counts. */
  arInsight?: FinanceHubInsightBlock;
  /** Phase 16D — AP aging consolidated (obra + corporativo). */
  apGlobalInsight?: FinanceHubInsightBlock;
  /** Phase 16D — AP líneas con `projectId` no nulo. */
  apWithProjectInsight?: FinanceHubInsightBlock;
  /** Phase 16D — AP corporativo (`projectId` null). */
  apCorporateInsight?: FinanceHubInsightBlock;
  accountingSection?: FinanceHubAccountingSection;
  /** Single list of shortcuts and reports; each `href` appears at most once (richer `description` wins on collision). */
  hubShortcuts: FinanceHubReportLink[];
  alerts: FinanceHubAlert[];
  /** Phase 17E — corporate AP snapshot (per-currency balances only). */
  companyOperations?: CompanyFinanceOperationsSummary;
  /** At least one finance-related tenant module is enabled */
  hasFinanceModules: boolean;
  /** User can see at least one hub section (AR / AP / TREASURY / ACCOUNTING) */
  canSeeAnything: boolean;
};

function buildMoneyCardFromAging(
  report: AgingReport | null,
  loadFailed: boolean,
): Pick<
  FinanceHubMoneyCard,
  "totalBalance" | "displayTotal" | "currency" | "multicurrency" | "overdueLineCount" | "loadFailed"
> {
  if (loadFailed || !report) {
    return {
      totalBalance:     null,
      displayTotal:     "—",
      currency:         null,
      multicurrency:    false,
      overdueLineCount: 0,
      loadFailed:       true,
    };
  }
  const curKeys = Object.keys(report.byCurrency);
  const multicurrency = curKeys.length > 1;
  let totalBalance: string | null = null;
  let currency: string | null = null;
  if (curKeys.length === 1) {
    const c = curKeys[0]!;
    totalBalance = report.byCurrency[c]!.totalBalance;
    currency = c;
  } else if (curKeys.length > 1) {
    totalBalance = null;
    currency = null;
  } else {
    totalBalance = report.totals.totalBalance;
    currency = "ARS";
  }
  const displayTotal = multicurrency
    ? "Multimoneda"
    : totalBalance != null && currency && currency.length === 3
      ? fmtDecimalEs(totalBalance, currency)
      : totalBalance != null
        ? fmtDecimalEs(totalBalance)
        : "—";
  return {
    totalBalance,
    displayTotal,
    currency,
    multicurrency,
    overdueLineCount: countOverdueFromAgingReport(report),
    loadFailed: false,
  };
}

function overdueAmountForItem(item: AgingItem): Prisma.Decimal {
  return item.daysOverdue > 0 ? new Prisma.Decimal(item.balanceDue) : ZERO;
}

function currentAmountForItem(item: AgingItem): Prisma.Decimal {
  return item.daysOverdue <= 0 ? new Prisma.Decimal(item.balanceDue) : ZERO;
}

/**
 * Aggregates open lines from an aging report, optionally filtered per line.
 * Skips non-positive balances. Never sums across currencies.
 */
function aggregateAgingByCurrency(
  report: AgingReport | null,
  itemFilter?: (item: AgingItem) => boolean,
): FinanceHubCurrencySnapshot[] {
  if (!report) return [];
  const map = new Map<
    string,
    {
      open: Prisma.Decimal;
      overdue: Prisma.Decimal;
      current: Prisma.Decimal;
      openLines: number;
      overdueLines: number;
    }
  >();
  for (const row of report.rows) {
    for (const item of row.items) {
      if (itemFilter && !itemFilter(item)) continue;
      const bal = new Prisma.Decimal(item.balanceDue);
      if (bal.lte(0)) continue;
      const cur = item.currency;
      const agg = map.get(cur) ?? {
        open: ZERO,
        overdue: ZERO,
        current: ZERO,
        openLines: 0,
        overdueLines: 0,
      };
      agg.open = agg.open.add(bal);
      agg.openLines += 1;
      if (item.daysOverdue > 0) {
        agg.overdue = agg.overdue.add(bal);
        agg.overdueLines += 1;
      } else {
        agg.current = agg.current.add(bal);
      }
      map.set(cur, agg);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, agg]) => {
      const overdueShareOfOpen = agg.open.gt(0)
        ? Math.min(1, Math.max(0, Number(agg.overdue.div(agg.open).toString())))
        : null;
      return {
        currency,
        openTotal: agg.open.toString(),
        overdueTotal: agg.overdue.toString(),
        currentOrNotDueTotal: agg.current.toString(),
        openLineCount: agg.openLines,
        overdueLineCount: agg.overdueLines,
        overdueShareOfOpen,
      };
    });
}

function buildInsightBlock(
  moduleEnabled: boolean,
  hasPermission: boolean,
  report: AgingReport | null,
  agingHref: string,
  itemFilter?: (item: AgingItem) => boolean,
): FinanceHubInsightBlock {
  if (!moduleEnabled) {
    return {
      moduleEnabled: false,
      hasPermission,
      visible:       false,
      loadFailed:    false,
      agingHref,
      multicurrency: false,
      byCurrency:    [],
    };
  }
  if (!hasPermission) {
    return {
      moduleEnabled: true,
      hasPermission: false,
      visible:       false,
      loadFailed:    false,
      agingHref,
      multicurrency: false,
      byCurrency:    [],
    };
  }
  const loadFailed = report === null;
  const byCurrency   = loadFailed ? [] : aggregateAgingByCurrency(report, itemFilter);
  const multicurrency = byCurrency.length > 1;
  return {
    moduleEnabled: true,
    hasPermission: true,
    visible:       true,
    loadFailed,
    agingHref,
    multicurrency,
    byCurrency,
  };
}

function pushUniqueQuickAction(
  list: FinanceHubQuickAction[],
  action: FinanceHubQuickAction,
  seen: Set<string>,
) {
  const key = action.href;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(action);
}

function mergeFinanceHubShortcuts(
  quickActions: FinanceHubQuickAction[],
  reportLinks: FinanceHubReportLink[],
): FinanceHubReportLink[] {
  const byHref = new Map<string, FinanceHubReportLink>();
  const order: string[] = [];
  for (const r of reportLinks) {
    byHref.set(r.href, r);
    order.push(r.href);
  }
  for (const q of quickActions) {
    if (!byHref.has(q.href)) {
      byHref.set(q.href, { label: q.label, href: q.href, description: "" });
      order.push(q.href);
    }
  }
  return order.map((h) => byHref.get(h)!);
}

/**
 * Hub `/finanzas`: resúmenes ligeros reutilizando aging AR/AP y saldo tesorería.
 * Phase 16D: desglose multimoneda, split AP obra vs corporativo, accesos rápidos, bloque contabilidad (solo enlace).
 * No duplica fórmulas de negocio; delega en servicios existentes.
 */
export async function getFinanceHubOverview(ctx: ServiceContext): Promise<FinanceHubOverview> {
  const gate = await getTenantModuleGate(ctx);

  const arMod    = gate.isEnabled("AR");
  const apMod    = gate.isEnabled("AP");
  const trMod    = gate.isEnabled("TREASURY");
  const acctMod  = gate.isEnabled("ACCOUNTING");
  const arPerm   = can(ctx.roles, "VIEW", "AR");
  const apPerm   = can(ctx.roles, "VIEW", "AP");
  const trPerm   = can(ctx.roles, "VIEW", "TREASURY");
  const acctPerm = can(ctx.roles, "VIEW", "ACCOUNTING");

  const hasFinanceModules = arMod || apMod || trMod || acctMod;

  const canSeeAnything =
    hasFinanceModules
    && ((arMod && arPerm) || (apMod && apPerm) || (trMod && trPerm) || (acctMod && acctPerm));

  const [arReport, apReport] = await Promise.all([
    arMod && arPerm ? safeRun(() => getReceivableAgingReport({}, ctx)) : Promise.resolve(null),
    apMod && apPerm ? safeRun(() => getPayableAgingReport({}, ctx)) : Promise.resolve(null),
  ]);

  const reportLinks: FinanceHubReportLink[] = [];
  if (arMod && arPerm) {
    reportLinks.push({
      label:       "Cuentas por cobrar",
      description: "Por cliente y vencimiento.",
      href:        "/finanzas/cuentas-por-cobrar-aging",
    });
  }
  if (apMod && apPerm) {
    reportLinks.push({
      label:       "Cuentas por pagar",
      description: "Por proveedor y vencimiento (global).",
      href:        "/finanzas/cuentas-por-pagar-aging",
    });
    reportLinks.push({
      label:       "Facturas y gastos (empresa)",
      description: "Gastos generales sin imputar a obra.",
      href:        "/finanzas/facturas-proveedor",
    });
    reportLinks.push({
      label:       "Pagos pendientes (empresa)",
      description: "Obligaciones sin proyecto.",
      href:        "/finanzas/cuentas-por-pagar",
    });
  }
  if (trMod && trPerm) {
    reportLinks.push({
      label:       "Reportes de tesorería",
      description: "Posición de caja, movimientos y flujo.",
      href:        "/tesoreria/reportes",
    });
  }
  if (apMod && apPerm && trMod && trPerm) {
    reportLinks.push({
      label:       "Movimientos — pagos empresa (AP)",
      description: "Egresos bancarios originados en pagos a proveedor sin proyecto.",
      href:        "/tesoreria/reportes/movimientos?sourceType=PAYMENT&type=OUTFLOW&corporateApPayments=true",
    });
  }

  let arCard: FinanceHubMoneyCard | undefined;
  if (arMod) {
    const money = buildMoneyCardFromAging(arReport, Boolean(arPerm && arReport === null));
    arCard = {
      moduleEnabled: true,
      hasPermission: arPerm,
      visible:       arPerm,
      agingHref:     "/finanzas/cuentas-por-cobrar-aging",
      ...money,
      loadFailed: arPerm ? money.loadFailed : false,
    };
  }

  let apCard: FinanceHubMoneyCard | undefined;
  if (apMod) {
    const money = buildMoneyCardFromAging(apReport, Boolean(apPerm && apReport === null));
    apCard = {
      moduleEnabled: true,
      hasPermission: apPerm,
      visible:       apPerm,
      agingHref:     "/finanzas/cuentas-por-pagar-aging",
      ...money,
      loadFailed: apPerm ? money.loadFailed : false,
    };
  }

  const arInsight = arMod
    ? buildInsightBlock(arMod, arPerm, arReport, "/finanzas/cuentas-por-cobrar-aging")
    : undefined;

  const apGlobalInsight = apMod
    ? buildInsightBlock(apMod, apPerm, apReport, "/finanzas/cuentas-por-pagar-aging")
    : undefined;

  const apWithProjectInsight = apMod
    ? buildInsightBlock(apMod, apPerm, apReport, "/finanzas/cuentas-por-pagar-aging", (it) => it.projectId != null)
    : undefined;

  const apCorporateInsight = apMod
    ? buildInsightBlock(apMod, apPerm, apReport, "/finanzas/cuentas-por-pagar-aging", (it) => it.projectId == null)
    : undefined;

  let treasuryCard: FinanceHubTreasuryCard | undefined;
  if (trMod) {
    let displayHeadline = "—";
    let balancesByCurrency: Record<string, string> = {};
    let multicurrency = false;
    let loadFailed = false;
    if (trPerm) {
      const tr = await safeRun(() => getTreasurySummaryByCompany(ctx));
      if (tr === null) {
        loadFailed = true;
      } else if (tr && tr.length > 0) {
        const byCur = new Map<string, Prisma.Decimal>();
        for (const acc of tr) {
          const cur = acc.currency;
          const bal = new Prisma.Decimal(acc.balance);
          byCur.set(cur, (byCur.get(cur) ?? new Prisma.Decimal(0)).plus(bal));
        }
        multicurrency = byCur.size > 1;
        for (const [cur, dec] of byCur) {
          balancesByCurrency[cur] = dec.toString();
        }
        if (byCur.size === 1) {
          const [only] = [...byCur.entries()];
          displayHeadline = fmtDecimalEs(only![1].toString(), only![0].length === 3 ? only![0] : undefined);
        } else {
          displayHeadline = "Multimoneda";
        }
      } else {
        displayHeadline = fmtDecimalEs("0", "ARS");
      }
    }
    treasuryCard = {
      moduleEnabled: true,
      hasPermission: trPerm,
      visible:       trPerm,
      multicurrency,
      balancesByCurrency,
      displayHeadline,
      treasuryHref:       "/tesoreria",
      reportsHref:        "/tesoreria/reportes",
      posicionCajaHref:   "/tesoreria/reportes/posicion-caja",
      movimientosHref:    "/tesoreria/reportes/movimientos",
      loadFailed,
    };
  }

  let accountingSection: FinanceHubAccountingSection | undefined;
  if (acctMod) {
    accountingSection = {
      moduleEnabled: true,
      hasPermission: acctPerm,
      visible:       acctPerm,
      href:          "/contabilidad",
    };
  }

  const quickActions: FinanceHubQuickAction[] = [];
  const qaSeen = new Set<string>();
  if (arMod && arPerm) {
    pushUniqueQuickAction(quickActions, { label: "Cuentas por cobrar", href: "/finanzas/cuentas-por-cobrar-aging" }, qaSeen);
  }
  if (apMod && apPerm) {
    pushUniqueQuickAction(
      quickActions,
      { label: "Gastos generales — asistente", href: "/finanzas/gastos-generales" },
      qaSeen,
    );
    pushUniqueQuickAction(
      quickActions,
      { label: "Nueva factura (empresa)", href: "/finanzas/facturas-proveedor/nueva" },
      qaSeen,
    );
    pushUniqueQuickAction(quickActions, { label: "Pagos pendientes", href: "/finanzas/cuentas-por-pagar" }, qaSeen);
    pushUniqueQuickAction(quickActions, { label: "Cuentas por pagar", href: "/finanzas/cuentas-por-pagar-aging" }, qaSeen);
    pushUniqueQuickAction(quickActions, { label: "Facturas y gastos", href: "/finanzas/facturas-proveedor" }, qaSeen);
  }
  if (trMod && trPerm) {
    pushUniqueQuickAction(quickActions, { label: "Tesorería", href: "/tesoreria" }, qaSeen);
    pushUniqueQuickAction(quickActions, { label: "Posición de caja", href: "/tesoreria/reportes/posicion-caja" }, qaSeen);
    pushUniqueQuickAction(quickActions, { label: "Movimientos", href: "/tesoreria/reportes/movimientos" }, qaSeen);
  }
  if (acctMod && acctPerm) {
    pushUniqueQuickAction(quickActions, { label: "Contabilidad", href: "/contabilidad" }, qaSeen);
  }

  const alerts: FinanceHubAlert[] = [];

  if (arMod && !arPerm && (apPerm || trPerm || acctPerm)) {
    alerts.push({
      variant: "info",
      message: "El módulo de cuentas por cobrar está activo pero no tenés permiso de lectura (VIEW AR). Pedí acceso si necesitás ver C×C.",
    });
  }
  if (apMod && !apPerm && (arPerm || trPerm || acctPerm)) {
    alerts.push({
      variant: "info",
      message: "El módulo de cuentas por pagar está activo pero no tenés permiso de lectura (VIEW AP). Las facturas y C×P empresa requieren VIEW AP.",
    });
  }
  if (trMod && !trPerm && (arPerm || apPerm || acctPerm)) {
    alerts.push({
      variant: "info",
      message: "Tesorería está habilitada pero no tenés VIEW TREASURY para ver saldos y reportes.",
    });
  }
  if (acctMod && !acctPerm && (arPerm || apPerm || trPerm)) {
    alerts.push({
      variant: "info",
      message: "Contabilidad está habilitada pero no tenés VIEW ACCOUNTING para abrir el libro.",
    });
  }

  const anyMulti =
    Boolean(arInsight?.multicurrency)
    || Boolean(apGlobalInsight?.multicurrency)
    || Boolean(treasuryCard?.multicurrency);

  const companyOperations = apMod && apPerm ? await getCompanyFinanceOperationsSummary(ctx) : undefined;

  if (anyMulti) {
    alerts.push({
      variant: "warning",
      message:
        "Hay más de una moneda en juego. Los importes se listan por moneda; no sumamos montos entre monedas distintas.",
    });
  }

  const hubShortcuts = mergeFinanceHubShortcuts(quickActions, reportLinks);

  return {
    arCard,
    apCard,
    treasuryCard,
    arInsight,
    apGlobalInsight,
    apWithProjectInsight,
    apCorporateInsight,
    accountingSection,
    hubShortcuts,
    alerts,
    companyOperations,
    hasFinanceModules,
    canSeeAnything,
  };
}
