import { can, type UserRole } from "@bloqer/domain";
import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

export function canViewTenantAuditLog(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "AUDIT");
}

function canReadConfigNav(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "TENANT_SETTINGS") || can(roles, "VIEW", "USERS_PERMISSIONS");
}

export function buildConfiguracionSubnavLinks(roles: UserRole[]): ModuleSubnavLink[] {
  const links: ModuleSubnavLink[] = [
    { href: "/configuracion", label: "General", match: "exact" },
    { href: "/configuracion/perfil", label: "Mi perfil" },
  ];

  if (canReadConfigNav(roles)) {
    links.push(
      { href: "/configuracion/equipo", label: "Equipo" },
      { href: "/configuracion/permisos", label: "Permisos" },
    );
  }

  if (canViewTenantAuditLog(roles)) {
    links.push({ href: "/configuracion/registro", label: "Registro" });
  }

  return links;
}
