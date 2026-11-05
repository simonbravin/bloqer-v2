import { can, type UserRole } from "@bloqer/domain";
import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

export function canAccessScheduledReportsNav(roles: UserRole[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "ADMIN");
}

export function canViewTenantAuditLog(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "AUDIT");
}

export function canReadConfigNav(
  roles: UserRole[],
  isTenantModuleEnabled: (module: "TENANT_SETTINGS" | "USERS_PERMISSIONS") => boolean = () => true,
): boolean {
  return (can(roles, "VIEW", "TENANT_SETTINGS") && isTenantModuleEnabled("TENANT_SETTINGS")) ||
    (can(roles, "VIEW", "USERS_PERMISSIONS") && isTenantModuleEnabled("USERS_PERMISSIONS"));
}

export function buildConfiguracionSubnavLinks(
  roles: UserRole[],
  isTenantModuleEnabled: (module: "TENANT_SETTINGS" | "USERS_PERMISSIONS" | "AUDIT") => boolean = () => true,
): ModuleSubnavLink[] {
  const links: ModuleSubnavLink[] = [
    { href: "/configuracion/perfil", label: "Mi perfil" },
    { href: "/configuracion/notificaciones", label: "Notificaciones" },
  ];

  if (canReadConfigNav(roles, isTenantModuleEnabled)) {
    links.unshift({ href: "/configuracion", label: "General", match: "exact" });
    links.push(
      { href: "/configuracion/equipo", label: "Equipo" },
      { href: "/configuracion/permisos", label: "Permisos" },
      { href: "/configuracion/politicas", label: "Políticas" },
    );
  }

  if (canAccessScheduledReportsNav(roles)) {
    links.push({ href: "/configuracion/reportes", label: "Reportes programados" });
  }

  if (canViewTenantAuditLog(roles) && isTenantModuleEnabled("AUDIT")) {
    links.push({ href: "/configuracion/registro", label: "Registro" });
  }

  return links;
}
