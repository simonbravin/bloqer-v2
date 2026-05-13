import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { getPayableAgingReport, getReceivableAgingReport } from "../aging/aging.service";
import { getUnreadNotificationCount } from "../notifications/notification.service";
import { canRunOperationalAlerts } from "../notifications/operational-alerts-runner.service";
import { listNegativeStockBalancesForTenant } from "../inventory/stock-balance.service";
import { listProducts } from "../inventory/product.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { canEditTeamMembership, canReadTenantConfigArea } from "../tenant-settings/tenant-settings-guards";
import { getTreasurySummaryByCompany } from "../treasury/balance.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";

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
  budgetAmount?: string | null;
  actualCost?: string | null;
  progressPct?: number | null;
  href: string;
};

export type DashboardProjectSummary = {
  activeProjectsCount: number;
  totalProjectsAmount: string;
  totalProjectsAmountNote?: string | null;
  averageProgressPct: number | null;
  projects: DashboardProjectRow[];
};

export type DashboardFinanceSummary = {
  receivablesTotal?: string | null;
  receivablesCurrency?: string | null;
  receivablesMulticurrency?: boolean;
  payablesTotal?: string | null;
  payablesCurrency?: string | null;
  payablesMulticurrency?: boolean;
  overdueReceivablesCount?: number;
  overduePayablesCount?: number;
  cashByCurrency?: Record<string, string>;
  cashMulticurrency?: boolean;
};

export type DashboardInventorySummary = {
  activeProductsCount: number;
  negativeStockCount: number;
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
  generatedAt: string;
  kpis: DashboardKpi[];
  projectSummary?: DashboardProjectSummary;
  /** Presupuestado vs real: solo enlace informativo (sin agregado global Phase 14B). */
  showCostControlHint?: boolean;
  financeSummary?: DashboardFinanceSummary;
  inventorySummary?: DashboardInventorySummary;
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

function countOverdueFromAgingReport(report: { rows: { items: { daysOverdue: number; balanceDue: string }[] }[] }): number {
  let n = 0;
  for (const row of report.rows) {
    for (const item of row.items) {
      if (item.daysOverdue > 0 && Number(item.balanceDue) > 0) n += 1;
    }
  }
  return n;
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
  rows: { projectId: string; totalSalePrice: Prisma.Decimal; totalCost: Prisma.Decimal }[],
): Map<string, { totalSalePrice: Prisma.Decimal; totalCost: Prisma.Decimal }> {
  const map = new Map<string, { totalSalePrice: Prisma.Decimal; totalCost: Prisma.Decimal }>();
  for (const r of rows) {
    if (!map.has(r.projectId)) map.set(r.projectId, { totalSalePrice: r.totalSalePrice, totalCost: r.totalCost });
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
  const generatedAt = new Date().toISOString();

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });
  const tenantName = tenant?.name ?? "Organización";

  const unreadNotifications = await getUnreadNotificationCount(ctx).catch(() => 0);
  if (unreadNotifications > 0) {
    kpis.push({
      key:   "notifications_unread",
      label: "Notificaciones sin leer",
      value: String(unreadNotifications),
      href:  "/notificaciones",
      tone:  unreadNotifications > 0 ? "warning" : "default",
    });
  }

  const showOperationalAlertsLink = canRunOperationalAlerts(ctx);

  // ─── Projects ─────────────────────────────────────────────────────────────
  let projectSummary: DashboardProjectSummary | undefined;
  let showCostControlHint = false;

  if (gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS")) {
    const canViewBudgets = gate.isEnabled("BUDGETS") && can(ctx.roles, "VIEW", "BUDGETS");
    const activeProjectsCount = await prisma.project.count({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    });

    const recent = await prisma.project.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true },
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
            select: { projectId: true, totalSalePrice: true, totalCost: true },
          })
        : [];

    const budgetByProject = pickLatestBudgetsPerProject(budgetRows);

    let totalSale = new Prisma.Decimal(0);
    if (ids.length > 0 && canViewBudgets) {
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
          select: { projectId: true, totalSalePrice: true, totalCost: true },
        });
        const byP = pickLatestBudgetsPerProject(allBudgetRows);
        for (const v of byP.values()) totalSale = totalSale.plus(v.totalSalePrice);
      }
    }

    const projects: DashboardProjectRow[] = recent.map((p) => {
      const b = budgetByProject.get(p.id);
      return {
        id:           p.id,
        name:         p.name,
        status:       p.status,
        budgetAmount: b ? b.totalSalePrice.toString() : null,
        actualCost:   b ? b.totalCost.toString() : null,
        progressPct:  null,
        href:         `/proyectos/${p.id}`,
      };
    });

    projectSummary = {
      activeProjectsCount,
      totalProjectsAmount: canViewBudgets ? fmtDecimalEs(totalSale.toString(), "ARS") : "—",
      totalProjectsAmountNote:
        !canViewBudgets && activeProjectsCount > 0
          ? "El total presupuestado requiere el módulo Presupuestos y permiso de lectura."
          : null,
      averageProgressPct: null,
      projects,
    };

    kpis.push({
      key:   "projects_active",
      label: "Proyectos activos",
      value: String(activeProjectsCount),
      href:  "/proyectos",
    });

    if (canViewBudgets) {
      kpis.push({
        key:     "projects_budgeted_total",
        label:   "Total presupuestado (venta, aprob./cerr.)",
        value:   fmtDecimalEs(totalSale.toString(), "ARS"),
        helper:  "Suma del último presupuesto aprobado o cerrado por proyecto activo.",
        href:    "/proyectos",
      });
    }

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
      if ((financeSummary!.overdueReceivablesCount ?? 0) > 0) {
        kpis.push({
          key:    "ar_overdue",
          label:  "CxC vencidas (líneas)",
          value:  String(financeSummary!.overdueReceivablesCount),
          href:   "/finanzas",
          tone:   "warning",
        });
      }
    }
  }

  if (apAllowed) {
    const ap = await safeRun("AP aging", () => getPayableAgingReport({}, ctx));
    if (ap) {
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
      if ((financeSummary!.overduePayablesCount ?? 0) > 0) {
        kpis.push({
          key:    "ap_overdue",
          label:  "CxP vencidas (líneas)",
          value:  String(financeSummary!.overduePayablesCount),
          href:   "/finanzas",
          tone:   "warning",
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
    inventorySummary = { activeProductsCount, negativeStockCount };
    kpis.push({
      key:   "inventory_products",
      label: "Productos activos",
      value: String(activeProductsCount),
      href:  "/inventario/productos",
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
      label:       "Finanzas",
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
      label:       "Contabilidad",
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

  const hasRichData =
    (projectSummary?.activeProjectsCount ?? 0) > 0 ||
    (financeSummary?.receivablesTotal != null && financeSummary.receivablesTotal !== "0") ||
    (financeSummary?.payablesTotal != null && financeSummary.payablesTotal !== "0") ||
    Object.keys(financeSummary?.cashByCurrency ?? {}).length > 0 ||
    (inventorySummary?.activeProductsCount ?? 0) > 0;

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
          ...(gate.isEnabled("ACCOUNTING") && can(ctx.roles, "VIEW", "ACCOUNTING")
            ? [
                {
                  title: "Revisar contabilidad",
                  body:  "Plan de cuentas y mapeos cuando empiecen los movimientos.",
                  href:  "/contabilidad",
                },
              ]
            : []),
          ...(gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY")
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
    generatedAt,
    kpis,
    projectSummary,
    showCostControlHint,
    financeSummary:
      financeSummary && financeSummaryHasData(financeSummary) ? financeSummary : undefined,
    inventorySummary,
    unreadNotifications,
    showOperationalAlertsLink,
    operationalOnboarding,
    onboardingSteps,
    warnings: [],
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
  if (f.receivablesTotal != null && f.receivablesTotal !== "") return true;
  if (f.payablesTotal != null && f.payablesTotal !== "") return true;
  if (f.cashByCurrency && Object.keys(f.cashByCurrency).length > 0) return true;
  if ((f.overdueReceivablesCount ?? 0) > 0) return true;
  if ((f.overduePayablesCount ?? 0) > 0) return true;
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
