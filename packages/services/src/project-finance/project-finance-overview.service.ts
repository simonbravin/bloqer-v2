import { Prisma } from "@bloqer/database";
import type { PermissionModule } from "@bloqer/domain";
import { can, type UserRole } from "@bloqer/domain";
import { getPayableAgingReport, getReceivableAgingReport } from "../aging/aging.service";
import { canEditArArea, canViewArProjectArea } from "../ar/ar-access";
import { listInvoicesByProject } from "../ar/sales-invoice.service";
import { listReceivablesByProject } from "../ar/receivable.service";
import { canViewApProjectArea } from "../ap/ap-access";
import { listPayablesByProject } from "../ap/payable.service";
import { listSupplierInvoicesByProject } from "../ap/supplier-invoice.service";
import { canViewBudgetsArea, listBudgetsByProject } from "../budget/budget.service";
import { canViewProjectCostControlReport } from "../cost-control/cost-control.service";
import { getProjectShellInfo } from "../project/project.service";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import { getTenantModuleGate, type TenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";

const ZERO = new Prisma.Decimal(0);

export type ProjectFinanceMoneyByCurrency = { currency: string; amount: string };

export type ProjectFinanceArLinks = {
  invoices: string;
  receivables: string;
  collections: string;
};

export type ProjectFinanceApLinks = {
  supplierInvoices: string;
  payables: string;
  payments: string;
};

export type ProjectFinanceArSection = {
  enabled: boolean;
  canView: boolean;
  totalReceivableByCurrency: ProjectFinanceMoneyByCurrency[];
  overdueByCurrency: ProjectFinanceMoneyByCurrency[];
  openInvoicesCount: number;
  links: ProjectFinanceArLinks;
};

export type ProjectFinanceApSection = {
  enabled: boolean;
  canView: boolean;
  totalPayableByCurrency: ProjectFinanceMoneyByCurrency[];
  overdueByCurrency: ProjectFinanceMoneyByCurrency[];
  openSupplierInvoicesCount: number;
  links: ProjectFinanceApLinks;
};

export type ProjectFinanceTreasurySection = {
  enabled: boolean;
  canView: boolean;
  cashFlowLink: string;
  /** Tesorería global no está desglosada por proyecto en el modelo actual. */
  notes: string[];
};

export type ProjectFinanceBudgetSection = {
  enabled: boolean;
  canViewBudgets: boolean;
  canViewCostControl: boolean;
  budgetLink: string;
  costControlLink: string;
  /** Presupuesto aprobado o cerrado más reciente por número de versión, si hay datos. */
  latestApprovedBudgetName: string | null;
  latestApprovedBudgetVersion: number | null;
  notes: string[];
};

export type ProjectFinanceQuickAction = {
  label: string;
  href: string;
  description?: string;
};

export type ProjectFinanceOverviewWarning = {
  module: PermissionModule;
  section: string;
  reason: "TENANT_MODULE_DISABLED" | "MISSING_PERMISSION" | "NO_DATA";
};

export type ProjectFinanceOverview = {
  project: {
    id: string;
    name: string;
    code: string;
    status: string;
  };
  sections: {
    ar?: ProjectFinanceArSection;
    ap?: ProjectFinanceApSection;
    treasury?: ProjectFinanceTreasurySection;
    budget?: ProjectFinanceBudgetSection;
  };
  quickActions: ProjectFinanceQuickAction[];
  warnings: ProjectFinanceOverviewWarning[];
};

function moneyRowsFromMap(m: Map<string, Prisma.Decimal>): ProjectFinanceMoneyByCurrency[] {
  return [...m.entries()]
    .filter(([, v]) => v.greaterThan(ZERO))
    .map(([currency, amount]) => ({ currency, amount: amount.toString() }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function aggregateReceivablesFromList(
  rows: Awaited<ReturnType<typeof listReceivablesByProject>>,
): { total: Map<string, Prisma.Decimal>; overdue: Map<string, Prisma.Decimal> } {
  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const r of rows) {
    if (r.status === "PAID" || r.status === "CANCELLED") continue;
    const bal = new Prisma.Decimal(r.balanceDue);
    if (bal.lessThanOrEqualTo(ZERO)) continue;
    const cur = r.currency;
    total.set(cur, (total.get(cur) ?? ZERO).add(bal));
    const due = new Date(r.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) overdue.set(cur, (overdue.get(cur) ?? ZERO).add(bal));
  }
  return { total, overdue };
}

function aggregatePayablesFromList(
  rows: Awaited<ReturnType<typeof listPayablesByProject>>,
): { total: Map<string, Prisma.Decimal>; overdue: Map<string, Prisma.Decimal> } {
  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const p of rows) {
    if (p.status === "PAID" || p.status === "CANCELLED") continue;
    const bal = new Prisma.Decimal(p.balanceDue);
    if (bal.lessThanOrEqualTo(ZERO)) continue;
    const cur = p.currency;
    total.set(cur, (total.get(cur) ?? ZERO).add(bal));
    const due = new Date(p.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) overdue.set(cur, (overdue.get(cur) ?? ZERO).add(bal));
  }
  return { total, overdue };
}

/**
 * Subnav "Finanzas" bajo `/proyectos/[id]`: módulo **PROJECTS** activo y al menos un bloque financiero/presupuesto visible.
 */
export function canShowProjectFinanzasNavLink(gate: TenantModuleGate, roles: UserRole[]): boolean {
  if (!gate.isEnabled("PROJECTS")) return false;
  const anyFinanceModule =
    gate.isEnabled("AR") ||
    gate.isEnabled("AP") ||
    gate.isEnabled("TREASURY") ||
    gate.isEnabled("BUDGETS") ||
    canViewProjectCashFlowReport(roles);
  if (!anyFinanceModule) return false;
  return (
    (gate.isEnabled("AR") && canViewArProjectArea(roles)) ||
    (gate.isEnabled("AP") && canViewApProjectArea(roles)) ||
    (gate.isEnabled("TREASURY") && can(roles, "VIEW", "TREASURY")) ||
    (gate.isEnabled("BUDGETS") && canViewBudgetsArea(roles)) ||
    canViewProjectCashFlowReport(roles)
  );
}

function pushUniqueQuickAction(
  out: ProjectFinanceQuickAction[],
  seen: Set<string>,
  action: ProjectFinanceQuickAction,
) {
  const key = `${action.label}::${action.href}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(action);
}

/**
 * Hub `/proyectos/[id]/finanzas`: lecturas livianas (aging con `projectId` cuando aplica `VIEW AR`/`VIEW AP`,
 * listados agregados por moneda cuando solo `VIEW PROJECTS` / área proyecto). Sin totales multimoneda mezclados.
 */
export async function getProjectFinanceOverview(
  ctx: ServiceContext,
  projectId: string,
): Promise<ProjectFinanceOverview> {
  const gate = await getTenantModuleGate(ctx);
  const shell = await getProjectShellInfo(projectId, ctx);
  const base = `/proyectos/${projectId}`;
  const warnings: ProjectFinanceOverviewWarning[] = [];
  const quickActions: ProjectFinanceQuickAction[] = [];
  const seenHrefs = new Set<string>();
  const sections: ProjectFinanceOverview["sections"] = {};

  const project = {
    id: shell.id,
    name: shell.name,
    code: shell.code,
    status: shell.status,
  };

  // ─── AR ────────────────────────────────────────────────────────────────────
  if (gate.isEnabled("AR")) {
    const canView = canViewArProjectArea(ctx.roles);
    const links: ProjectFinanceArLinks = {
      invoices:    `${base}/facturas`,
      receivables: `${base}/cuentas-por-cobrar`,
      collections: `${base}/cobranzas`,
    };
    if (!canView) {
      warnings.push({ module: "AR", section: "ar", reason: "MISSING_PERMISSION" });
      sections.ar = {
        enabled: true,
        canView: false,
        totalReceivableByCurrency: [],
        overdueByCurrency:         [],
        openInvoicesCount:         0,
        links,
      };
    } else {
      let totalReceivableByCurrency: ProjectFinanceMoneyByCurrency[] = [];
      let overdueByCurrency: ProjectFinanceMoneyByCurrency[] = [];
      try {
        if (can(ctx.roles, "VIEW", "AR")) {
          const report = await getReceivableAgingReport({ projectId }, ctx);
          totalReceivableByCurrency = Object.entries(report.byCurrency)
            .filter(([, t]) => Number(t.totalBalance) > 0)
            .map(([currency, t]) => ({
              currency,
              amount: t.totalBalance,
            }));
          overdueByCurrency = Object.entries(report.byCurrency)
            .filter(([, t]) => Number(t.totalOverdue) > 0)
            .map(([currency, t]) => ({
              currency,
              amount: t.totalOverdue,
            }));
        } else {
          const list = await listReceivablesByProject(projectId, ctx);
          const { total, overdue } = aggregateReceivablesFromList(list);
          totalReceivableByCurrency = moneyRowsFromMap(total);
          overdueByCurrency         = moneyRowsFromMap(overdue);
        }
      } catch {
        warnings.push({ module: "AR", section: "ar", reason: "NO_DATA" });
      }

      const invoices = await listInvoicesByProject(projectId, ctx);
      const openInvoicesCount = invoices.filter((i) => i.status === "ISSUED").length;

      sections.ar = {
        enabled: true,
        canView: true,
        totalReceivableByCurrency,
        overdueByCurrency,
        openInvoicesCount,
        links,
      };

      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver facturas de venta", href: links.invoices });
      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver cuentas por cobrar", href: links.receivables });
      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver cobranzas", href: links.collections });
      if (canEditArArea(ctx.roles)) {
        pushUniqueQuickAction(quickActions, seenHrefs, {
          label:        "Registrar cobranza",
          href:         `${base}/cobranzas/nueva`,
          description: "Alta de cobro vinculada al proyecto.",
        });
      }
    }
  }

  // ─── AP ────────────────────────────────────────────────────────────────────
  if (gate.isEnabled("AP")) {
    const canView = canViewApProjectArea(ctx.roles);
    const links: ProjectFinanceApLinks = {
      supplierInvoices: `${base}/facturas-proveedor`,
      payables:         `${base}/cuentas-por-pagar`,
      payments:         `${base}/pagos`,
    };
    if (!canView) {
      warnings.push({ module: "AP", section: "ap", reason: "MISSING_PERMISSION" });
      sections.ap = {
        enabled: true,
        canView: false,
        totalPayableByCurrency:      [],
        overdueByCurrency:           [],
        openSupplierInvoicesCount:   0,
        links,
      };
    } else {
      let totalPayableByCurrency: ProjectFinanceMoneyByCurrency[] = [];
      let overdueByCurrency: ProjectFinanceMoneyByCurrency[] = [];
      try {
        if (can(ctx.roles, "VIEW", "AP")) {
          const report = await getPayableAgingReport({ projectId }, ctx);
          totalPayableByCurrency = Object.entries(report.byCurrency)
            .filter(([, t]) => Number(t.totalBalance) > 0)
            .map(([currency, t]) => ({
              currency,
              amount: t.totalBalance,
            }));
          overdueByCurrency = Object.entries(report.byCurrency)
            .filter(([, t]) => Number(t.totalOverdue) > 0)
            .map(([currency, t]) => ({
              currency,
              amount: t.totalOverdue,
            }));
        } else {
          const list = await listPayablesByProject(projectId, ctx);
          const { total, overdue } = aggregatePayablesFromList(list);
          totalPayableByCurrency = moneyRowsFromMap(total);
          overdueByCurrency      = moneyRowsFromMap(overdue);
        }
      } catch {
        warnings.push({ module: "AP", section: "ap", reason: "NO_DATA" });
      }

      const supplierInvoices = await listSupplierInvoicesByProject(projectId, ctx);
      const openSupplierInvoicesCount = supplierInvoices.filter((i) => i.status === "ISSUED").length;

      sections.ap = {
        enabled: true,
        canView: true,
        totalPayableByCurrency,
        overdueByCurrency,
        openSupplierInvoicesCount,
        links,
      };

      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver facturas proveedor", href: links.supplierInvoices });
      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver cuentas por pagar", href: links.payables });
      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver pagos", href: links.payments });
      if (can(ctx.roles, "EDIT", "AP")) {
        pushUniqueQuickAction(quickActions, seenHrefs, {
          label:        "Registrar pago",
          href:         links.payables,
          description: "Desde cada C×P podés abrir el registro de pago.",
        });
      }
    }
  }

  // ─── Flujo de caja (proyecto) + contexto tesorería ─────────────────────────
  const cashFlowLink = `${base}/flujo-caja`;
  const treasuryNotes: string[] = [];
  if (!gate.isEnabled("TREASURY")) {
    treasuryNotes.push(
      "El módulo de tesorería está deshabilitado para este tenant: no se muestran saldos bancarios globales aquí.",
    );
  } else if (!can(ctx.roles, "VIEW", "TREASURY")) {
    treasuryNotes.push("No tenés permiso de tesorería: el saldo por cuenta sigue disponible en Tesorería para roles autorizados.");
  } else {
    treasuryNotes.push(
      "Los saldos por cuenta bancaria son a nivel empresa. El flujo de caja del proyecto resume cobros y pagos imputados a la obra.",
    );
  }

  const canCashFlow = gate.isEnabled("PROJECTS") && canViewProjectCashFlowReport(ctx.roles);
  if (canCashFlow) {
    sections.treasury = {
      enabled:       true,
      canView:       true,
      cashFlowLink,
      notes:         treasuryNotes,
    };
    pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver flujo de caja del proyecto", href: cashFlowLink });
  }

  // ─── Presupuesto / control de costos ───────────────────────────────────────
  const budgetsGate = gate.isEnabled("BUDGETS") && gate.isEnabled("PROJECTS");
  const canBudgets = budgetsGate && canViewBudgetsArea(ctx.roles);
  const canCostCtl =
    gate.isEnabled("BUDGETS") &&
    gate.isEnabled("PROJECTS") &&
    canViewProjectCostControlReport(ctx.roles);

  if (budgetsGate) {
    const budgetLink = `${base}/presupuestos`;
    const costControlLink = `${base}/control-costos`;
    let latestApprovedBudgetName: string | null = null;
    let latestApprovedBudgetVersion: number | null = null;
    const budgetNotes: string[] = [];

    if (canBudgets) {
      try {
        const budgets = await listBudgetsByProject(projectId, ctx);
        const approved = budgets.filter((b) => b.status === "APPROVED" || b.status === "CLOSED");
        if (approved.length === 0) {
          budgetNotes.push("No hay presupuestos aprobados o cerrados para este proyecto.");
        } else {
          const pick = approved.reduce((a, b) => (a.versionNumber >= b.versionNumber ? a : b));
          latestApprovedBudgetName = pick.name;
          latestApprovedBudgetVersion = pick.versionNumber;
        }
      } catch {
        warnings.push({ module: "BUDGETS", section: "budget", reason: "NO_DATA" });
      }
      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver presupuestos", href: budgetLink });
    } else {
      warnings.push({ module: "BUDGETS", section: "budget", reason: "MISSING_PERMISSION" });
    }

    if (canCostCtl) {
      pushUniqueQuickAction(quickActions, seenHrefs, { label: "Ver control de costos", href: costControlLink });
    }

    sections.budget = {
      enabled:                   true,
      canViewBudgets:            canBudgets,
      canViewCostControl:        canCostCtl,
      budgetLink,
      costControlLink,
      latestApprovedBudgetName,
      latestApprovedBudgetVersion,
      notes:                     budgetNotes,
    };
  }

  return { project, sections, quickActions, warnings };
}
