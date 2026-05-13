import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { getPayableAgingReport, getReceivableAgingReport, type AgingReport } from "../aging/aging.service";
import { getUnreadNotificationCount } from "../notifications/notification.service";
import { canRunOperationalAlerts } from "../notifications/operational-alerts-runner.service";
import { listNegativeStockBalancesForTenant } from "../inventory/stock-balance.service";
import { listProducts } from "../inventory/product.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { canEditTeamMembership, canReadTenantConfigArea } from "../tenant-settings/tenant-settings-guards";
import { getTreasurySummaryByCompany } from "../treasury/balance.service";
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

export type TenantDashboardView = {
  tenantName: string;
  subscription: TenantSubscriptionInfo | null;
  generatedAt: string;
  kpis: DashboardKpi[];
  projectStatusSlices: DashboardProjectStatusSlice[];
  projectSummary?: DashboardProjectSummary;
  /** Presupuestado vs real: solo enlace informativo (sin agregado global Phase 14B). */
  showCostControlHint?: boolean;
  financeSummary?: DashboardFinanceSummary;
  inventorySummary?: DashboardInventorySummary;
  accountingSummary?: DashboardAccountingSummary;
  unreadNotifications: number;
  showOperationalAlertsLink: boolean;
  /** Sin proyectos/finanzas/inventario ni notificaciones: mostrar pasos iniciales en UI. */
  operationalOnboarding: boolean;
  /** Cuando no hay datos operativos: pasos sugeridos (solo con permiso + módulo). */
  onboardingSteps?: Array<{ title: string; body: string; href?: string }>;
  warnings: DashboardModuleWarning[];
  quickActions: DashboardQuickAction[];
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

  let projectStatusSlices: DashboardProjectStatusSlice[] = [];
  if (gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS")) {
    const grouped = await prisma.project.groupBy({
      by: ["status"],
      where: { tenantId: ctx.tenantId },
      _count: { _all: true },
    });
    const labelMap: Record<string, string> = {
      DRAFT: "Borrador",
      ACTIVE: "Activo",
      ON_HOLD: "En pausa",
      COMPLETED: "Finalizado",
      CANCELLED: "Cancelado",
    };
    projectStatusSlices = grouped
      .filter((g) => g._count._all > 0)
      .map((g) => ({
        status: g.status,
        count: g._count._all,
        label: labelMap[g.status] ?? g.status,
      }))
      .sort((a, b) => b.count - a.count);
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
    kpis.push({
      key:   "projects_draft",
      label: "Proyectos borrador",
      value: String(draftProjectsCount),
      href:  "/proyectos",
      tone:  draftProjectsCount > 0 ? "default" : "muted",
    });
    kpis.push({
      key:   "projects_on_hold",
      label: "Proyectos en pausa",
      value: String(onHoldProjectsCount),
      href:  "/proyectos",
      tone:  onHoldProjectsCount > 0 ? "warning" : "muted",
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
          label:  "Presupuesto venta (activos)",
          value:  fmtDecimalEs(only.amount, only.currency),
          helper: "Último aprobado/cerrado por proyecto activo, en una sola moneda.",
          href:   "/proyectos",
        });
      } else if (budgetSaleByCurrency.length > 1) {
        kpis.push({
          key:    "projects_budgeted_total",
          label:  "Presupuesto venta (activos)",
          value:  "Multimoneda",
          helper: "Totales por moneda en el tablero (no se suman divisas).",
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

  // ─── Finance (AR / AP / Treasury) ─────────────────────────────────────────
  let financeSummary: DashboardFinanceSummary | undefined;

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
      if ((financeSummary!.overdueReceivablesCount ?? 0) > 0) {
        kpis.push({
          key:    "ar_overdue",
          label:  "CxC vencidas (líneas)",
          value:  String(financeSummary!.overdueReceivablesCount),
          href:   "/finanzas",
          tone:   "warning",
        });
      }
      if ((financeSummary!.receivablesDueSoonCount ?? 0) > 0) {
        kpis.push({
          key:    "ar_due_soon",
          label:  "CxC próximas (14 días)",
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
      if ((financeSummary!.overduePayablesCount ?? 0) > 0) {
        kpis.push({
          key:    "ap_overdue",
          label:  "CxP vencidas (líneas)",
          value:  String(financeSummary!.overduePayablesCount),
          href:   "/finanzas",
          tone:   "warning",
        });
      }
      if ((financeSummary!.payablesDueSoonCount ?? 0) > 0) {
        kpis.push({
          key:    "ap_due_soon",
          label:  "CxP próximas (14 días)",
          value:  String(financeSummary!.payablesDueSoonCount),
          href:   "/finanzas/cuentas-por-pagar-aging",
          tone:   "muted",
        });
      }
    }
  }

  if (trAllowed) {
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

  // ─── Inventory ─────────────────────────────────────────────────────────────
  let inventorySummary: DashboardInventorySummary | undefined;
  if (gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY")) {
    const products = await safeRun("listProducts", () =>
      listProducts({ status: "ACTIVE" }, ctx),
    );
    const activeProductsCount = products?.length ?? 0;
    let negativeStockCount = 0;
    try {
      const neg = await listNegativeStockBalancesForTenant({ tenantId: ctx.tenantId });
      negativeStockCount = neg.length;
    } catch {
      /* best-effort */
    }
    const activeWarehousesCount = await prisma.warehouse.count({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    });
    inventorySummary = { activeProductsCount, negativeStockCount, activeWarehousesCount };
    kpis.push({
      key:   "inventory_products",
      label: "Productos activos",
      value: String(activeProductsCount),
      href:  "/inventario/productos",
    });
    kpis.push({
      key:   "inventory_warehouses",
      label: "Depósitos activos",
      value: String(activeWarehousesCount),
      href:  "/inventario/depositos",
      tone:  "muted",
    });
    if (negativeStockCount > 0) {
      kpis.push({
        key:    "inventory_negative",
        label:  "Stock negativo (ubicaciones)",
        value:  String(negativeStockCount),
        href:   "/inventario",
        tone:   "danger",
      });
    }
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
      description: "CxC, CxP y reportes",
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
      label:       "Aging CxC",
      href:        "/finanzas/cuentas-por-cobrar-aging",
      description: "Cuentas por cobrar por vencimiento",
    });
  }
  if (apAllowed) {
    quickActions.push({
      label:       "Aging CxP",
      href:        "/finanzas/cuentas-por-pagar-aging",
      description: "Cuentas por pagar por vencimiento",
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
    kpis.push({
      key:    "accounting_draft",
      label:  "Asientos en borrador",
      value:  String(journalDraftCount),
      href:   "/contabilidad",
      tone:   journalDraftCount > 0 ? "warning" : "muted",
    });
    kpis.push({
      key:    "accounting_posted",
      label:  "Asientos contabilizados",
      value:  String(journalPostedCount),
      href:   "/contabilidad",
      tone:   "muted",
    });
  }

  const hasRichData =
    (projectSummary?.activeProjectsCount ?? 0) > 0 ||
    (projectSummary?.draftProjectsCount ?? 0) > 0 ||
    (financeSummary?.receivablesTotal != null && financeSummary.receivablesTotal !== "0") ||
    (financeSummary?.payablesTotal != null && financeSummary.payablesTotal !== "0") ||
    (financeSummary?.receivablesOpenByCurrency?.length ?? 0) > 0 ||
    (financeSummary?.payablesOpenByCurrency?.length ?? 0) > 0 ||
    Object.keys(financeSummary?.cashByCurrency ?? {}).length > 0 ||
    (inventorySummary?.activeProductsCount ?? 0) > 0 ||
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
    projectStatusSlices,
    projectSummary,
    showCostControlHint,
    financeSummary:
      financeSummary && financeSummaryHasData(financeSummary) ? financeSummary : undefined,
    inventorySummary,
    accountingSummary,
    unreadNotifications,
    showOperationalAlertsLink,
    operationalOnboarding,
    onboardingSteps,
    warnings,
    quickActions: dedupeQuickActions(quickActions),
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
