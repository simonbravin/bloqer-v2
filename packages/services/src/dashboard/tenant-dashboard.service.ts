import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { getPayableAgingReport, getReceivableAgingReport, type AgingReport } from "../aging/aging.service";
import { getUnreadNotificationCount } from "../notifications/notification.service";
import { canRunOperationalAlerts } from "../notifications/operational-alerts-runner.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { canEditTeamMembership, canReadTenantConfigArea } from "../tenant-settings/tenant-settings-guards";
import { getTreasurySummaryByCompany } from "../treasury/balance.service";
import { getCashFlowReport, type CashFlowReport } from "../treasury-reports/treasury-reports.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";

const ZERO = new Prisma.Decimal(0);

export type DashboardKpiTone = "default" | "success" | "warning" | "danger" | "muted";

export type DashboardKpi = {
  key: string;
  label: string;
  value: string;
  helper?: string;
  href?: string;
  tone?: DashboardKpiTone;
};

export type DashboardProjectRow = {
  id: string;
  name: string;
  status: string;
  clientName?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  budgetAmount?: string | null;
  budgetCurrency?: string | null;
  actualCost?: string | null;
  progressPct?: number | null;
  href: string;
};

export type DashboardProjectSummary = {
  activeProjectsCount: number;
  draftProjectsCount: number;
  onHoldProjectsCount: number;
  /** Suma del último presupuesto aprobado/cerrado **por moneda** (solo proyectos activos). Nunca mezcla divisas. */
  budgetSaleByCurrency: { currency: string; amount: string }[];
  averageProgressPct: number | null;
  projects: DashboardProjectRow[];
};

/** @deprecated Kept for optional widgets; no longer returned from `getTenantDashboard`. */
export type DashboardProjectStatusSlice = {
  status: string;
  count: number;
  label: string;
};

export type TenantSubscriptionInfo = {
  saasPlan: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  /** Días hasta el fin del trial (solo si `subscriptionStatus` es trial y hay `trialEndsAt`). */
  trialDaysRemaining: number | null;
  trialWarning: string | null;
};

export type DashboardFinanceSummary = {
  receivablesTotal?: string | null;
  receivablesCurrency?: string | null;
  receivablesMulticurrency?: boolean;
  /** Total abierto por moneda (aging). */
  receivablesOpenByCurrency?: { currency: string; total: string }[];
  payablesTotal?: string | null;
  payablesCurrency?: string | null;
  payablesMulticurrency?: boolean;
  payablesOpenByCurrency?: { currency: string; total: string }[];
  overdueReceivablesCount?: number;
  overduePayablesCount?: number;
  receivablesDueSoonCount?: number;
  payablesDueSoonCount?: number;
  cashByCurrency?: Record<string, string>;
  cashMulticurrency?: boolean;
};

/** @deprecated Kept for `InventorySummaryCard`; no longer returned from `getTenantDashboard`. */
export type DashboardInventorySummary = {
  activeProductsCount: number;
  negativeStockCount: number;
  activeWarehousesCount: number;
};

export type DashboardAccountingSummary = {
  journalDraftCount: number;
  journalPostedCount: number;
};

export type DashboardModuleWarning = {
  module: string;
  label: string;
  message: string;
};

export type DashboardQuickAction = {
  label: string;
  href: string;
  description?: string;
};

export type DashboardCashFlowRange = "month" | "3m" | "6m" | "1y";

export type DashboardCashFlowChart = {
  byRange: Partial<Record<DashboardCashFlowRange, CashFlowReport>>;
  detailHref: string;
};

export type TenantDashboardView = {
  tenantName: string;
  subscription: TenantSubscriptionInfo | null;
  generatedAt: string;
  kpis: DashboardKpi[];
  projectSummary?: DashboardProjectSummary;
  /** Presupuestado vs real: solo enlace informativo (sin agregado global Phase 14B). */
  showCostControlHint?: boolean;
  financeSummary?: DashboardFinanceSummary;
  accountingSummary?: DashboardAccountingSummary;
  unreadNotifications: number;
  showOperationalAlertsLink: boolean;
  /** Sin proyectos/finanzas/inventario ni notificaciones: mostrar pasos iniciales en UI. */
  operationalOnboarding: boolean;
  /** Cuando no hay datos operativos: pasos sugeridos (solo con permiso + módulo). */
  onboardingSteps?: Array<{ title: string; body: string; href?: string }>;
  warnings: DashboardModuleWarning[];
  quickActions: DashboardQuickAction[];
  /** Flujo de caja tesorería (movimientos confirmados); omitido sin módulo/permiso. */
  cashFlowChart?: DashboardCashFlowChart;
};

function fmtDecimalEs(value: string, currencyCode?: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  if (currencyCode) {
    try {
      return new Intl.NumberFormat("es-AR", {
        style:    "currency",
        currency: currencyCode,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${value} ${currencyCode}`;
    }
  }
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
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

/** Líneas con saldo y vencimiento en los próximos `withinDays` días (según `asOfDate` del aging). */
function countDueSoonFromAgingReport(report: AgingReport, withinDays: number): number {
  const asOf = new Date(`${report.asOfDate}T12:00:00`);
  const end = new Date(asOf);
  end.setDate(end.getDate() + withinDays);
  let n = 0;
  for (const row of report.rows) {
    for (const item of row.items) {
      if (Number(item.balanceDue) <= 0) continue;
      const due = new Date(`${item.dueDate}T12:00:00`);
      if (due > asOf && due <= end) n += 1;
    }
  }
  return n;
}

function agingOpenByCurrency(report: AgingReport): { currency: string; total: string }[] {
  return Object.entries(report.byCurrency)
    .map(([currency, t]) => ({ currency, total: t.totalBalance }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function trialDaysRemaining(trialEndsAt: Date | null, now: Date): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  end.setHours(0, 0, 0, 0);
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - t.getTime()) / 86400000);
  return diff;
}

function buildSubscriptionInfo(row: {
  saasPlan: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
}): TenantSubscriptionInfo {
  const now = new Date();
  const trialEndsIso = row.trialEndsAt ? row.trialEndsAt.toISOString().slice(0, 10) : null;
  const days = row.subscriptionStatus === "TRIAL" ? trialDaysRemaining(row.trialEndsAt, now) : null;
  let trialWarning: string | null = null;
  if (row.subscriptionStatus === "TRIAL" && days !== null) {
    if (days < 0) trialWarning = "El período de prueba finalizó. Revisá el plan con tu administrador.";
    else if (days <= 3) trialWarning = `Quedan ${days} día(s) de prueba.`;
    else if (days <= 14) trialWarning = `La prueba vence en ${days} días.`;
  }
  return {
    saasPlan: row.saasPlan,
    subscriptionStatus: row.subscriptionStatus,
    trialEndsAt: trialEndsIso,
    trialDaysRemaining: days,
    trialWarning,
  };
}

function safeRun<T>(_label: string, fn: () => Promise<T>): Promise<T | null> {
  return fn().catch((e: unknown) => {
    if (e instanceof ServiceError) {
      if (e.code === "FORBIDDEN") return null;
    }
    throw e;
  });
}

/** Latest APPROVED/CLOSED budget per project (first row wins after version desc sort). */
function cashFlowRangeDates(range: DashboardCashFlowRange): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date(to);
  if (range === "month") {
    from.setDate(1);
  } else if (range === "3m") {
    from.setMonth(from.getMonth() - 3);
  } else if (range === "6m") {
    from.setMonth(from.getMonth() - 6);
  } else {
    from.setFullYear(from.getFullYear() - 1);
  }
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
}

function cashFlowPeriodForRange(range: DashboardCashFlowRange): "day" | "week" | "month" {
  return range === "month" ? "day" : "month";
}

async function sumMonthlyTreasuryOutflows(ctx: ServiceContext): Promise<Map<string, Prisma.Decimal>> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const movements = await prisma.accountMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "CONFIRMED",
      type: "OUTFLOW",
      movementDate: { gte: start, lte: now },
    },
    select: { amount: true, currency: true },
  });
  const byCur = new Map<string, Prisma.Decimal>();
  for (const m of movements) {
    byCur.set(m.currency, (byCur.get(m.currency) ?? ZERO).plus(m.amount));
  }
  return byCur;
}

function pushMoneyKpi(
  kpis: DashboardKpi[],
  key: string,
  label: string,
  byCurrency: Map<string, Prisma.Decimal>,
  href: string,
  emptyLabel = "—",
) {
  const entries = [...byCurrency.entries()].filter(([, a]) => a.greaterThan(ZERO));
  if (entries.length === 0) {
    kpis.push({ key, label, value: emptyLabel, href, tone: "muted" });
    return;
  }
  if (entries.length === 1) {
    const [currency, amount] = entries[0]!;
    kpis.push({
      key,
      label,
      value: fmtDecimalEs(amount.toString(), currency),
      href,
    });
    return;
  }
  kpis.push({
    key,
    label,
    value: "Multimoneda",
    helper: "Ver detalle por moneda en Finanzas.",
    href,
    tone: "muted",
  });
}

function pickLatestBudgetsPerProject(
  rows: {
    projectId: string;
    totalSalePrice: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    currency: string;
  }[],
): Map<string, { totalSalePrice: Prisma.Decimal; totalCost: Prisma.Decimal; currency: string }> {
  const map = new Map<string, { totalSalePrice: Prisma.Decimal; totalCost: Prisma.Decimal; currency: string }>();
  for (const r of rows) {
    if (!map.has(r.projectId)) {
      map.set(r.projectId, { totalSalePrice: r.totalSalePrice, totalCost: r.totalCost, currency: r.currency });
    }
  }
  return map;
}

/**
 * Tenant executive dashboard (Phase 14B). Single `getTenantModuleGate` load; sections gated by module + `can()`.
 * No mock data; empty sections omitted or surfaced via KPIs / quick actions.
 */
export async function getTenantDashboard(ctx: ServiceContext): Promise<TenantDashboardView> {
  const gate = await getTenantModuleGate(ctx);
  const kpis: DashboardKpi[] = [];
  const quickActions: DashboardQuickAction[] = [];
  const warnings: DashboardModuleWarning[] = [];
  const generatedAt = new Date().toISOString();

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      name: true,
      saasPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });
  const tenantName = tenant?.name ?? "Organización";
  const subscription = tenant
    ? buildSubscriptionInfo({
        saasPlan: tenant.saasPlan,
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
      })
    : null;

  if (subscription?.trialWarning) {
    warnings.push({
      module: "TENANT",
      label: "Plan",
      message: subscription.trialWarning,
    });
  }

  const unreadNotifications = await getUnreadNotificationCount(ctx).catch(() => 0);
  kpis.push({
    key:   "notifications_unread",
    label: "Notificaciones sin leer",
    value: String(unreadNotifications),
    href:  "/notificaciones",
    tone:  unreadNotifications > 0 ? "warning" : "muted",
  });

  const showOperationalAlertsLink = canRunOperationalAlerts(ctx);

  // ─── Projects ─────────────────────────────────────────────────────────────
  let projectSummary: DashboardProjectSummary | undefined;
  let showCostControlHint = false;

  if (gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS")) {
    const canViewBudgets = gate.isEnabled("BUDGETS") && can(ctx.roles, "VIEW", "BUDGETS");
    const activeProjectsCount = await prisma.project.count({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    });
    const draftProjectsCount = await prisma.project.count({
      where: { tenantId: ctx.tenantId, status: "DRAFT" },
    });
    const onHoldProjectsCount = await prisma.project.count({
      where: { tenantId: ctx.tenantId, status: "ON_HOLD" },
    });

    kpis.push({
      key:   "projects_active",
      label: "Proyectos activos",
      value: String(activeProjectsCount),
      href:  "/proyectos",
    });

    const recent = await prisma.project.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        expectedEndDate: true,
        client: { select: { fantasyName: true, legalName: true } },
      },
    });
    const ids = recent.map((p) => p.id);

    const budgetRows =
      ids.length > 0 && canViewBudgets
        ? await prisma.budget.findMany({
            where: {
              tenantId:  ctx.tenantId,
              projectId: { in: ids },
              status:    { in: ["APPROVED", "CLOSED"] },
            },
            orderBy: [{ projectId: "asc" }, { versionNumber: "desc" }],
            select: { projectId: true, totalSalePrice: true, totalCost: true, currency: true },
          })
        : [];

    const budgetByProject = pickLatestBudgetsPerProject(budgetRows);

    let budgetSaleByCurrency: { currency: string; amount: string }[] = [];
    if (canViewBudgets) {
      const allActiveIds = await prisma.project.findMany({
        where: { tenantId: ctx.tenantId, status: "ACTIVE" },
        select: { id: true },
      });
      const allIds = allActiveIds.map((p) => p.id);
      if (allIds.length > 0) {
        const allBudgetRows = await prisma.budget.findMany({
          where: {
            tenantId:  ctx.tenantId,
            projectId: { in: allIds },
            status:    { in: ["APPROVED", "CLOSED"] },
          },
          orderBy: [{ projectId: "asc" }, { versionNumber: "desc" }],
          select: { projectId: true, totalSalePrice: true, totalCost: true, currency: true },
        });
        const byP = pickLatestBudgetsPerProject(allBudgetRows);
        const saleByCur = new Map<string, Prisma.Decimal>();
        for (const v of byP.values()) {
          saleByCur.set(v.currency, (saleByCur.get(v.currency) ?? ZERO).plus(v.totalSalePrice));
        }
        budgetSaleByCurrency = [...saleByCur.entries()]
          .filter(([, a]) => a.greaterThan(ZERO))
          .map(([currency, amount]) => ({ currency, amount: amount.toString() }))
          .sort((a, b) => a.currency.localeCompare(b.currency));
      }

      if (budgetSaleByCurrency.length === 1) {
        const only = budgetSaleByCurrency[0]!;
        kpis.push({
          key:    "projects_budgeted_total",
          label:  "Presupuesto total (activos)",
          value:  fmtDecimalEs(only.amount, only.currency),
          helper: "Suma del último presupuesto aprobado/cerrado por obra activa.",
          href:   "/proyectos",
        });
      } else if (budgetSaleByCurrency.length > 1) {
        kpis.push({
          key:    "projects_budgeted_total",
          label:  "Presupuesto total (activos)",
          value:  "Multimoneda",
          helper: "Totales por moneda (no se suman divisas).",
          href:   "/proyectos",
          tone:   "muted",
        });
      } else {
        kpis.push({
          key:    "projects_budgeted_total",
          label:  "Presupuesto total (activos)",
          value:  "—",
          helper: "Sin presupuestos aprobados o cerrados en obras activas.",
          href:   "/proyectos",
          tone:   "muted",
        });
      }
    }

    const projects: DashboardProjectRow[] = recent.map((p) => {
      const b = budgetByProject.get(p.id);
      return {
        id:               p.id,
        name:             p.name,
        status:           p.status,
        clientName:       p.client ? (p.client.fantasyName ?? p.client.legalName) : null,
        startDate:        isoDate(p.startDate),
        expectedEndDate:  isoDate(p.expectedEndDate),
        budgetAmount:     b ? b.totalSalePrice.toString() : null,
        budgetCurrency:   b ? b.currency : null,
        actualCost:       b ? b.totalCost.toString() : null,
        progressPct:      null,
        href:             `/proyectos/${p.id}`,
      };
    });

    projectSummary = {
      activeProjectsCount,
      draftProjectsCount,
      onHoldProjectsCount,
      budgetSaleByCurrency,
      averageProgressPct: null,
      projects,
    };

    if (can(ctx.roles, "EDIT", "PROJECTS")) {
      quickActions.push({
        label:       "Nuevo proyecto",
        href:        "/proyectos/nuevo",
        description: "Alta de obra con cliente",
      });
    }

    showCostControlHint =
      gate.isEnabled("PROJECTS") &&
      gate.isEnabled("BUDGETS") &&
      can(ctx.roles, "VIEW", "PROJECTS") &&
      can(ctx.roles, "VIEW", "BUDGETS");
  }

  // ─── Certifications ───────────────────────────────────────────────────────
  if (gate.isEnabled("CERTIFICATIONS") && can(ctx.roles, "VIEW", "CERTIFICATIONS")) {
    const pendingCertCount = await prisma.certification.count({
      where: { tenantId: ctx.tenantId, status: "DRAFT" },
    });
    kpis.push({
      key:    "certifications_pending",
      label:  "Certificaciones pendientes",
      value:  String(pendingCertCount),
      href:   "/proyectos",
      helper: "Certificaciones en borrador (sin emitir).",
      tone:   pendingCertCount > 0 ? "warning" : "muted",
    });
  }

  // ─── Finance (AR / AP / Treasury) ─────────────────────────────────────────
  let financeSummary: DashboardFinanceSummary | undefined;
  let cashFlowChart: DashboardCashFlowChart | undefined;

  const arAllowed = gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR");
  const apAllowed = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  const trAllowed = gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY");

  if (arAllowed || apAllowed || trAllowed) {
    financeSummary = {};
  }

  if (arAllowed) {
    const ar = await safeRun("AR aging", () => getReceivableAgingReport({}, ctx));
    if (ar) {
      financeSummary!.receivablesOpenByCurrency = agingOpenByCurrency(ar);
      const curKeys = Object.keys(ar.byCurrency);
      financeSummary!.receivablesMulticurrency = curKeys.length > 1;
      if (curKeys.length === 1) {
        const c = curKeys[0]!;
        financeSummary!.receivablesCurrency = c;
        financeSummary!.receivablesTotal = ar.byCurrency[c]!.totalBalance;
      } else if (curKeys.length > 1) {
        financeSummary!.receivablesTotal = null;
      } else {
        financeSummary!.receivablesTotal = ar.totals.totalBalance;
        financeSummary!.receivablesCurrency = "ARS";
      }
      financeSummary!.overdueReceivablesCount = countOverdueFromAgingReport(ar);
      financeSummary!.receivablesDueSoonCount = countDueSoonFromAgingReport(ar, 14);
      const arOpen = new Map<string, Prisma.Decimal>();
      for (const row of financeSummary!.receivablesOpenByCurrency ?? []) {
        arOpen.set(row.currency, new Prisma.Decimal(row.total));
      }
      pushMoneyKpi(kpis, "ar_open", "Cuentas por cobrar", arOpen, "/finanzas/cuentas-por-cobrar-aging", "$ 0,00");
      if ((financeSummary!.overdueReceivablesCount ?? 0) > 0) {
        kpis.push({
          key:    "ar_overdue",
          label:  "Cuentas por cobrar vencidas",
          value:  String(financeSummary!.overdueReceivablesCount),
          href:   "/finanzas",
          tone:   "warning",
        });
      }
      if ((financeSummary!.receivablesDueSoonCount ?? 0) > 0) {
        kpis.push({
          key:    "ar_due_soon",
          label:  "Cuentas por cobrar próximas (14 días)",
          value:  String(financeSummary!.receivablesDueSoonCount),
          href:   "/finanzas/cuentas-por-cobrar-aging",
          tone:   "muted",
        });
      }
    }
  }

  if (apAllowed) {
    const ap = await safeRun("AP aging", () => getPayableAgingReport({}, ctx));
    if (ap) {
      financeSummary!.payablesOpenByCurrency = agingOpenByCurrency(ap);
      const curKeys = Object.keys(ap.byCurrency);
      financeSummary!.payablesMulticurrency = curKeys.length > 1;
      if (curKeys.length === 1) {
        const c = curKeys[0]!;
        financeSummary!.payablesCurrency = c;
        financeSummary!.payablesTotal = ap.byCurrency[c]!.totalBalance;
      } else if (curKeys.length > 1) {
        financeSummary!.payablesTotal = null;
      } else {
        financeSummary!.payablesTotal = ap.totals.totalBalance;
        financeSummary!.payablesCurrency = "ARS";
      }
      financeSummary!.overduePayablesCount = countOverdueFromAgingReport(ap);
      financeSummary!.payablesDueSoonCount = countDueSoonFromAgingReport(ap, 14);
      const apOpen = new Map<string, Prisma.Decimal>();
      for (const row of financeSummary!.payablesOpenByCurrency ?? []) {
        apOpen.set(row.currency, new Prisma.Decimal(row.total));
      }
      pushMoneyKpi(kpis, "ap_open", "Cuentas por pagar", apOpen, "/finanzas/cuentas-por-pagar-aging", "$ 0,00");
      if ((financeSummary!.overduePayablesCount ?? 0) > 0) {
        kpis.push({
          key:    "ap_overdue",
          label:  "Cuentas por pagar vencidas",
          value:  String(financeSummary!.overduePayablesCount),
          href:   "/finanzas",
          tone:   "warning",
        });
      }
      if ((financeSummary!.payablesDueSoonCount ?? 0) > 0) {
        kpis.push({
          key:    "ap_due_soon",
          label:  "Cuentas por pagar próximas (14 días)",
          value:  String(financeSummary!.payablesDueSoonCount),
          href:   "/finanzas/cuentas-por-pagar-aging",
          tone:   "muted",
        });
      }
    }
  }

  if (trAllowed) {
    const monthlyOut = await safeRun("Monthly outflows", () => sumMonthlyTreasuryOutflows(ctx));
    if (monthlyOut) {
      pushMoneyKpi(
        kpis,
        "treasury_monthly_expenses",
        "Gastos del mes",
        monthlyOut,
        "/tesoreria/reportes/flujo-caja",
        "$ 0,00",
      );
    }

    const cfRanges: DashboardCashFlowRange[] = ["month", "3m", "6m", "1y"];
    const byRange: Partial<Record<DashboardCashFlowRange, CashFlowReport>> = {};
    for (const range of cfRanges) {
      const { dateFrom, dateTo } = cashFlowRangeDates(range);
      const report = await safeRun(`Cash flow ${range}`, () =>
        getCashFlowReport({ dateFrom, dateTo, period: cashFlowPeriodForRange(range) }, ctx),
      );
      if (report && report.length > 0) byRange[range] = report;
    }
    if (Object.keys(byRange).length > 0) {
      cashFlowChart = { byRange, detailHref: "/tesoreria/reportes/flujo-caja" };
    }

    const tr = await safeRun("Treasury summary", () => getTreasurySummaryByCompany(ctx));
    if (tr && tr.length > 0) {
      const byCur = new Map<string, Prisma.Decimal>();
      for (const acc of tr) {
        const cur = acc.currency;
        const bal = new Prisma.Decimal(acc.balance);
        byCur.set(cur, (byCur.get(cur) ?? new Prisma.Decimal(0)).plus(bal));
      }
      const cashByCurrency: Record<string, string> = {};
      for (const [cur, dec] of byCur) {
        cashByCurrency[cur] = dec.toString();
      }
      financeSummary!.cashByCurrency = cashByCurrency;
      financeSummary!.cashMulticurrency = byCur.size > 1;
      if (byCur.size === 1) {
        const [only] = [...byCur.entries()];
        kpis.push({
          key:    "treasury_balance",
          label:  "Saldo tesorería (cuentas activas)",
          value:  fmtDecimalEs(only![1].toString(), only![0].length === 3 ? only![0] : undefined),
          href:   "/tesoreria",
        });
      } else {
        kpis.push({
          key:    "treasury_balance",
          label:  "Saldo tesorería",
          value:  "Multimoneda",
          helper: "Varias monedas: ver detalle en Tesorería.",
          href:   "/tesoreria",
          tone:   "muted",
        });
      }
    }
  }

  if (gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY")) {
    quickActions.push({
      label:       "Inventario",
      href:        "/inventario",
      description: "Productos y depósitos",
    });
  }

  if (arAllowed || apAllowed) {
    quickActions.push({
      label:       "Ver finanzas",
      href:        "/finanzas",
      description: "Cuentas por cobrar, cuentas por pagar y reportes",
    });
  }

  if (trAllowed && can(ctx.roles, "EDIT", "TREASURY")) {
    quickActions.push({
      label:       "Tesorería",
      href:        "/tesoreria",
      description: "Cuentas y movimientos",
    });
    quickActions.push({
      label:       "Registrar movimiento",
      href:        "/tesoreria/cuentas",
      description: "Elegí una cuenta y cargá movimientos",
    });
  }

  if (arAllowed) {
    quickActions.push({
      label:       "Cuentas por cobrar",
      href:        "/finanzas/cuentas-por-cobrar-aging",
      description: "Saldos por cliente y vencimiento",
    });
  }
  if (apAllowed) {
    quickActions.push({
      label:       "Cuentas por pagar",
      href:        "/finanzas/cuentas-por-pagar-aging",
      description: "Saldos por proveedor y vencimiento",
    });
  }
  if (!arAllowed && !apAllowed && trAllowed) {
    quickActions.push({
      label:       "Ver reportes",
      href:        "/tesoreria/reportes",
      description: "Posición de caja y flujos",
    });
  }

  if (gate.isEnabled("USERS_PERMISSIONS") && canReadTenantConfigArea(ctx.roles) && canEditTeamMembership(ctx.roles)) {
    quickActions.push({
      label:       "Invitar al equipo",
      href:        "/configuracion/equipo/invitar",
      description: "Enviá invitaciones por email",
    });
  }

  // ─── Directory / team / accounting quick links ─────────────────────────────
  if (gate.isEnabled("DIRECTORY") && can(ctx.roles, "EDIT", "DIRECTORY")) {
    quickActions.push({
      label:       "Nuevo contacto",
      href:        "/directorio/nuevo",
      description: "Clientes, proveedores y más",
    });
  }

  if (gate.isEnabled("ACCOUNTING") && can(ctx.roles, "VIEW", "ACCOUNTING")) {
    quickActions.push({
      label:       "Ver contabilidad",
      href:        "/contabilidad",
      description: "Plan de cuentas y asientos",
    });
  }

  if (canReadTenantConfig(gate, ctx)) {
    quickActions.push({
      label:       "Configuración",
      href:        "/configuracion",
      description: "Equipo y ajustes del tenant",
    });
  }

  let accountingSummary: DashboardAccountingSummary | undefined;
  if (ctx.companyId && gate.isEnabled("ACCOUNTING") && can(ctx.roles, "VIEW", "ACCOUNTING")) {
    const companyId = ctx.companyId;
    const [journalDraftCount, journalPostedCount] = await Promise.all([
      prisma.journalEntry.count({
        where: { tenantId: ctx.tenantId, companyId, status: "DRAFT" },
      }),
      prisma.journalEntry.count({
        where: { tenantId: ctx.tenantId, companyId, status: "POSTED" },
      }),
    ]);
    accountingSummary = { journalDraftCount, journalPostedCount };
  }

  const hasRichData =
    (projectSummary?.activeProjectsCount ?? 0) > 0 ||
    (projectSummary?.draftProjectsCount ?? 0) > 0 ||
    (financeSummary?.receivablesTotal != null && financeSummary.receivablesTotal !== "0") ||
    (financeSummary?.payablesTotal != null && financeSummary.payablesTotal !== "0") ||
    (financeSummary?.receivablesOpenByCurrency?.length ?? 0) > 0 ||
    (financeSummary?.payablesOpenByCurrency?.length ?? 0) > 0 ||
    Object.keys(financeSummary?.cashByCurrency ?? {}).length > 0 ||
    (accountingSummary?.journalDraftCount ?? 0) > 0 ||
    (accountingSummary?.journalPostedCount ?? 0) > 0;

  const operationalOnboarding = !hasRichData && unreadNotifications === 0;

  const onboardingSteps =
    operationalOnboarding
      ? [
          ...(gate.isEnabled("PROJECTS") && can(ctx.roles, "EDIT", "PROJECTS")
            ? [
                {
                  title: "Crear tu primer proyecto",
                  body:  "Dá de alta la obra y asociá al cliente.",
                  href:  "/proyectos/nuevo",
                },
              ]
            : []),
          ...(gate.isEnabled("DIRECTORY") && can(ctx.roles, "EDIT", "DIRECTORY")
            ? [
                {
                  title: "Cargar contactos",
                  body:  "Clientes, proveedores y equipo en el directorio.",
                  href:  "/directorio/nuevo",
                },
              ]
            : []),
          ...(gate.isEnabled("BUDGETS") &&
          gate.isEnabled("PROJECTS") &&
          can(ctx.roles, "VIEW", "PROJECTS")
            ? [
                {
                  title: "Cargar un presupuesto",
                  body:  "En cada proyecto, creá o aprobá una versión para planificar costos y venta.",
                  href:  "/proyectos",
                },
              ]
            : []),
          ...(canReadTenantConfig(gate, ctx)
            ? [
                {
                  title: "Revisar módulos activos",
                  body:  "Equipo, permisos y ajustes generales del tenant.",
                  href:  "/configuracion",
                },
              ]
            : []),
          ...(gate.isEnabled("ACCOUNTING") && can(ctx.roles, "VIEW", "ACCOUNTING")
            ? [
                {
                  title: "Revisar contabilidad",
                  body:  "Plan de cuentas y mapeos cuando empiecen los movimientos.",
                  href:  "/contabilidad",
                },
              ]
            : []),
          ...(gate.isEnabled("TREASURY") && can(ctx.roles, "EDIT", "TREASURY")
            ? [
                {
                  title: "Configurar tesorería",
                  body:  "Alta de cuentas bancarias y cajas.",
                  href:  "/tesoreria/cuentas/nueva",
                },
              ]
            : []),
          ...(gate.isEnabled("USERS_PERMISSIONS") &&
          canReadTenantConfigArea(ctx.roles) &&
          canEditTeamMembership(ctx.roles)
            ? [
                {
                  title: "Invitar al equipo",
                  body:  "Sumá colaboradores con roles acordes.",
                  href:  "/configuracion/equipo/invitar",
                },
              ]
            : []),
        ]
      : undefined;

  return {
    tenantName,
    subscription,
    generatedAt,
    kpis,
    projectSummary,
    showCostControlHint,
    financeSummary:
      financeSummary && financeSummaryHasData(financeSummary) ? financeSummary : undefined,
    accountingSummary,
    unreadNotifications,
    showOperationalAlertsLink,
    operationalOnboarding,
    onboardingSteps,
    warnings,
    quickActions: dedupeQuickActions(quickActions),
    cashFlowChart,
  };
}

function canReadTenantConfig(
  gate: Awaited<ReturnType<typeof getTenantModuleGate>>,
  ctx: ServiceContext,
): boolean {
  const ts = gate.isEnabled("TENANT_SETTINGS") && can(ctx.roles, "VIEW", "TENANT_SETTINGS");
  const up = gate.isEnabled("USERS_PERMISSIONS") && can(ctx.roles, "VIEW", "USERS_PERMISSIONS");
  return ts || up;
}

function financeSummaryHasData(f: DashboardFinanceSummary): boolean {
  if (f.receivablesOpenByCurrency && f.receivablesOpenByCurrency.length > 0) return true;
  if (f.payablesOpenByCurrency && f.payablesOpenByCurrency.length > 0) return true;
  if (f.receivablesTotal != null && f.receivablesTotal !== "") return true;
  if (f.payablesTotal != null && f.payablesTotal !== "") return true;
  if (f.cashByCurrency && Object.keys(f.cashByCurrency).length > 0) return true;
  if ((f.overdueReceivablesCount ?? 0) > 0) return true;
  if ((f.overduePayablesCount ?? 0) > 0) return true;
  if ((f.receivablesDueSoonCount ?? 0) > 0) return true;
  if ((f.payablesDueSoonCount ?? 0) > 0) return true;
  if (f.receivablesMulticurrency || f.payablesMulticurrency || f.cashMulticurrency) return true;
  return false;
}

function dedupeQuickActions(actions: DashboardQuickAction[]): DashboardQuickAction[] {
  const seen = new Set<string>();
  const out: DashboardQuickAction[] = [];
  for (const a of actions) {
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    out.push(a);
  }
  return out;
}

export function formatDashboardMoney(value: string, currency?: string | null): string {
  if (currency && currency.length === 3) return fmtDecimalEs(value, currency);
  return fmtDecimalEs(value);
}
