import { can, type UserRole } from "@bloqer/domain";
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

function canReadConfigNav(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "TENANT_SETTINGS") || can(roles, "VIEW", "USERS_PERMISSIONS");
}

const GLOBAL_NAV_SECTION_DEFS: GlobalNavSectionDef[] = [
  {
    title: "General",
    items: [
      { label: "Inicio", href: "/dashboard" },
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
            { action: "VIEW", module: "TREASURY" },
          ],
        },
      },
      { label: "Cuentas por cobrar", href: "/finanzas/cuentas-por-cobrar-aging", require: { action: "VIEW", module: "AR" } },
      { label: "Cuentas por pagar", href: "/finanzas/cuentas-por-pagar-aging", require: { action: "VIEW", module: "AP" } },
      { label: "Imputación GG", href: "/finanzas/gastos-generales", require: { action: "VIEW", module: "AP" } },
    ],
  },
  {
    title: "Tesorería",
    items: [
      { label: "Resumen", href: "/tesoreria", matchExact: true, require: { action: "VIEW", module: "TREASURY" } },
      { label: "Cuentas", href: "/tesoreria/cuentas", require: { action: "VIEW", module: "TREASURY" } },
      {
        label: "Transferencias",
        href: "/tesoreria/transferencias",
        require: { action: "VIEW", module: "TREASURY" },
      },
      { label: "Reportes", href: "/tesoreria/reportes", require: { action: "VIEW", module: "TREASURY" } },
    ],
  },
  {
    title: "Contabilidad",
    items: [
      { label: "Resumen", href: "/contabilidad", matchExact: true, require: { action: "VIEW", module: "ACCOUNTING" } },
      { label: "Plan de cuentas", href: "/contabilidad/cuentas", require: { action: "VIEW", module: "ACCOUNTING" } },
      { label: "Asientos", href: "/contabilidad/asientos", require: { action: "VIEW", module: "ACCOUNTING" } },
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
 */
export function buildGlobalNavSections(
  roles: UserRole[],
  isTenantModuleEnabled: (module: PermissionModule) => boolean,
): GlobalNavSection[] {
  const sections: GlobalNavSection[] = [];

  for (const def of GLOBAL_NAV_SECTION_DEFS) {
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
