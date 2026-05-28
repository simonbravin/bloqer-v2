"use client";

import { ModuleSubnav } from "@/components/layout/module-subnav";

export function PlatformTenantSubnav({ tenantId }: { tenantId: string }) {
  const base = `/platform/tenants/${tenantId}`;
  const links = [
    { href: base, label: "Resumen", match: "exact" as const },
    { href: `${base}/users`, label: "Usuarios" },
    { href: `${base}/invitations`, label: "Invitaciones" },
    { href: `${base}/modules`, label: "Módulos" },
    { href: `${base}/settings`, label: "Suscripción" },
  ];

  return (
    <ModuleSubnav links={links} ariaLabel="Navegación del tenant" sectionLabel="Organización" />
  );
}
