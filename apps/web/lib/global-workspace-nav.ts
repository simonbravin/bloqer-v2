import { can, hasCompanyFinanceRole, type UserRole } from "@bloqer/domain";
import type { PermissionModule } from "@bloqer/domain";
import { satisfiesNavRequirement, type NavRequirement } from "./nav-config";
import { canAccessScheduledReportsNav } from "./configuracion-subnav";

function canViewTenantAuditLog(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "AUDIT");
}

export type GlobalNavLinkDef = {
  label: string;
  href: string;
  matchExact?: boolean;
  require?: NavRequirement;
};

export type GlobalNavSectionDef = {
  title: string;
  items: GlobalNavLinkDef[];
};

export type GlobalNavSection = {
  title: string;
  items: { label: string; href: string; matchExact?: boolean }[];
};

const FINANCE_AREA: NavRequirement = {
  anyOf: [
    { action: "VIEW", module: "AR" },
    { action: "VIEW", module: "AP" },
    { action: "VIEW", module: "TREASURY" },
    { action: "VIEW", module: "ACCOUNTING" },
  ],
};

const COMPANY_FINANCE_SECTION_TITLES = new Set(["Finanzas", "Tesorería", "Contabilidad"]);

function canReadConfigNav(roles: UserRole[]): boolean {
  // Equipo + Permisos share this OR today: only OWNER/ADMIN have either leaf (PERM-005).
  // If a future role gains TENANT_SETTINGS without USERS_PERMISSIONS, split the nav leaves.
  return can(roles, "VIEW", "TENANT_SETTINGS") || can(roles, "VIEW", "USERS_PERMISSIONS");
}

const GLOBAL_NAV_SECTION_DEFS: GlobalNavSectionDef[] = [
  {
    title: "General",
    items: [
      { label: "Inicio", href: "/dashboard" },
      { label: "Pendientes", href: "/pendientes", matchExact: true },
      { label: "Proyectos", href: "/proyectos", require: { action: "VIEW", module: "PROJECTS" } },
      { label: "Directorio", href: "/directorio", require: { action: "VIEW", module: "DIRECTORY" } },
      { label: "Inventario", href: "/inventario", require: { action: "VIEW", module: "INVENTORY" } },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { label: "Tablero", href: "/finanzas", matchExact: true, require: FINANCE_AREA },
      {
        label: "Transacciones",
        href: "/finanzas/transacciones",
        require: {
          anyOf: [
            { action: "VIEW", module: "AP" },
            { action: "VIEW", module: "AR" },
            { action: "VIEW", module: "TREASURY" },
          ],
        },
      },
      {
        label: "Facturas y gastos",
        href: "/finanzas/facturas-proveedor",
        require: { action: "VIEW", module: "AP" },
      },
      { label: "Cuentas por cobrar", href: "/finanzas/cuentas-por-cobrar", require: { action: "VIEW", module: "AR" } },
      { label: "Cuentas por pagar", href: "/finanzas/cuentas-por-pagar", require: { action: "VIEW", module: "AP" } },
      { label: "Imputación GG", href: "/finanzas/gastos-generales", require: { action: "VIEW", module: "AP" } },
    ],
  },
  {
    title: "Tesorería",
    items: [
      { label: "Resumen", href: "/tesoreria", matchExact: true, require: { action: "VIEW", module: "TREASURY" } },
      { label: "Cuentas", href: "/tesoreria/cuentas", require: { action: "VIEW", module: "BANK_ACCOUNTS" } },
      {
        label: "Movimientos",
        href: "/tesoreria/movimientos",
        require: { action: "VIEW", module: "TREASURY" },
      },
      {
        label: "Flujo de caja",
        href: "/tesoreria/flujo-caja",
        require: { action: "VIEW", module: "TREASURY" },
      },
      {
        label: "Transferencias",
        href: "/tesoreria/transferencias",
        require: { action: "VIEW", module: "INTERNAL_TRANSFERS" },
      },
      {
        label: "Conciliación",
        href: "/tesoreria/conciliacion",
        require: { action: "VIEW", module: "BANK_RECONCILIATION" },
      },
    ],
  },
  {
    title: "Contabilidad",
    items: [
      { label: "Resumen", href: "/contabilidad", matchExact: true, require: { action: "VIEW", module: "ACCOUNTING" } },
      { label: "Plan de cuentas", href: "/contabilidad/cuentas", require: { action: "VIEW", module: "ACCOUNTING" } },
      { label: "Asientos", href: "/contabilidad/asientos", require: { action: "VIEW", module: "ACCOUNTING" } },
      {
        label: "Cierres",
        href: "/contabilidad/cierres",
        require: { action: "VIEW", module: "PERIOD_CLOSE" },
      },
      { label: "Reglas", href: "/contabilidad/reglas", require: { action: "VIEW", module: "ACCOUNTING" } },
    ],
  },
  {
    title: "Configuración",
    items: [
      { label: "General", href: "/configuracion", matchExact: true },
      { label: "Mi perfil", href: "/configuracion/perfil" },
      { label: "Equipo", href: "/configuracion/equipo" },
      { label: "Permisos", href: "/configuracion/permisos" },
      { label: "Reportes programados", href: "/configuracion/reportes" },
      { label: "Registro", href: "/configuracion/registro", require: { action: "VIEW", module: "AUDIT" } },
    ],
  },
];

/**
 * Global shell sidebar (outside a project). Same permission + module gates as route handlers.
 * Company finance sections require a company-finance role (D-056).
 */
export function buildGlobalNavSections(
  roles: UserRole[],
  isTenantModuleEnabled: (module: PermissionModule) => boolean,
): GlobalNavSection[] {
  const sections: GlobalNavSection[] = [];
  const companyFinance = hasCompanyFinanceRole(roles);

  for (const def of GLOBAL_NAV_SECTION_DEFS) {
    if (COMPANY_FINANCE_SECTION_TITLES.has(def.title) && !companyFinance) {
      continue;
    }

    const items: GlobalNavSection["items"] = [];

    for (const item of def.items) {
      if (def.title === "Configuración") {
        if (item.href === "/configuracion/perfil") {
          items.push({ label: item.label, href: item.href, matchExact: item.matchExact });
          continue;
        }
        if (item.href === "/configuracion/reportes") {
          if (canAccessScheduledReportsNav(roles)) {
            items.push({ label: item.label, href: item.href, matchExact: item.matchExact });
          }
          continue;
        }
        if (item.href === "/configuracion/registro") {
          if (canViewTenantAuditLog(roles)) {
            items.push({ label: item.label, href: item.href, matchExact: item.matchExact });
          }
          continue;
        }
        if (!canReadConfigNav(roles)) continue;
        items.push({ label: item.label, href: item.href, matchExact: item.matchExact });
        continue;
      }
      if (!item.require) {
        items.push({ label: item.label, href: item.href, matchExact: item.matchExact });
        continue;
      }
      if (satisfiesNavRequirement(roles, item.require, isTenantModuleEnabled)) {
        items.push({ label: item.label, href: item.href, matchExact: item.matchExact });
      }
    }

    if (items.length > 0) sections.push({ title: def.title, items });
  }

  return sections;
}
