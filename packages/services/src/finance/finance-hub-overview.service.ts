import { Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  getPayableAgingReport,
  getReceivableAgingReport,
  type AgingReport,
} from "../aging/aging.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { getTreasurySummaryByCompany } from "../treasury/balance.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";

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
  loadFailed: boolean;
};

export type FinanceHubReportLink = {
  label: string;
  description: string;
  href: string;
};

export type FinanceHubOverview = {
  arCard?: FinanceHubMoneyCard;
  apCard?: FinanceHubMoneyCard;
  treasuryCard?: FinanceHubTreasuryCard;
  reportLinks: FinanceHubReportLink[];
  /** At least one of AR, AP, TREASURY modules is enabled for the tenant */
  hasFinanceModules: boolean;
  /** User can see at least one finance card or report link */
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

/**
 * Hub `/finanzas`: resúmenes ligeros reutilizando aging AR/AP y saldo tesorería.
 * No duplica fórmulas de negocio; delega en servicios existentes.
 */
export async function getFinanceHubOverview(ctx: ServiceContext): Promise<FinanceHubOverview> {
  const gate = await getTenantModuleGate(ctx);

  const arMod  = gate.isEnabled("AR");
  const apMod  = gate.isEnabled("AP");
  const trMod  = gate.isEnabled("TREASURY");
  const arPerm = can(ctx.roles, "VIEW", "AR");
  const apPerm = can(ctx.roles, "VIEW", "AP");
  const trPerm = can(ctx.roles, "VIEW", "TREASURY");

  const hasFinanceModules = arMod || apMod || trMod;

  const reportLinks: FinanceHubReportLink[] = [];
  if (arMod && arPerm) {
    reportLinks.push({
      label:       "Aging — Cuentas por cobrar",
      description: "Por cliente y vencimiento.",
      href:        "/finanzas/cuentas-por-cobrar-aging",
    });
  }
  if (apMod && apPerm) {
    reportLinks.push({
      label:       "Aging — Cuentas por pagar",
      description: "Por proveedor y vencimiento.",
      href:        "/finanzas/cuentas-por-pagar-aging",
    });
  }
  if (trMod && trPerm) {
    reportLinks.push({
      label:       "Reportes de tesorería",
      description: "Posición de caja, movimientos y flujo.",
      href:        "/tesoreria/reportes",
    });
  }

  let arCard: FinanceHubMoneyCard | undefined;
  if (arMod) {
    const arReport = arPerm ? await safeRun(() => getReceivableAgingReport({}, ctx)) : null;
    const money    = buildMoneyCardFromAging(arReport, Boolean(arPerm && arReport === null));
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
    const apReport = apPerm ? await safeRun(() => getPayableAgingReport({}, ctx)) : null;
    const money    = buildMoneyCardFromAging(apReport, Boolean(apPerm && apReport === null));
    apCard = {
      moduleEnabled: true,
      hasPermission: apPerm,
      visible:       apPerm,
      agingHref:     "/finanzas/cuentas-por-pagar-aging",
      ...money,
      loadFailed: apPerm ? money.loadFailed : false,
    };
  }

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
      treasuryHref: "/tesoreria",
      reportsHref:  "/tesoreria/reportes",
      loadFailed,
    };
  }

  const canSeeAnything =
    hasFinanceModules && (arPerm || apPerm || trPerm);

  return {
    arCard,
    apCard,
    treasuryCard,
    reportLinks,
    hasFinanceModules,
    canSeeAnything,
  };
}
