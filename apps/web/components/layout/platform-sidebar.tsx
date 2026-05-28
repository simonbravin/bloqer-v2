"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { CollapsibleNavSection } from "@/features/shell/components/collapsible-nav-section";
import { NavItem } from "@/features/shell/components/nav-item";
import { usePlatformNav } from "@/features/platform/platform-nav-context";
import { PlatformNavIcon } from "@/lib/platform-nav-icons";

const PLATFORM_LINKS = [
  { href: "/platform", label: "Consola", matchExact: true as const },
  { href: "/platform/tenants", label: "Organizaciones" },
  { href: "/platform/vencimientos", label: "Vencimientos" },
  { href: "/platform/registro", label: "Registro de actividad" },
  { href: "/platform/tenants/new", label: "Crear organización" },
] as const;

export function PlatformSidebar() {
  const pathname = usePathname();
  const { activeTenant } = usePlatformNav();

  const tenantIdFromPath = useMemo(() => {
    const m = pathname.match(/^\/platform\/tenants\/([^/]+)/);
    return m?.[1] && m[1] !== "new" ? m[1] : null;
  }, [pathname]);

  const tenantId = activeTenant?.id ?? tenantIdFromPath;

  const tenantLinks = useMemo(() => {
    if (!tenantId) return null;
    return [
      { href: `/platform/tenants/${tenantId}`, label: "Resumen", matchExact: true as const },
      { href: `/platform/tenants/${tenantId}/users`, label: "Usuarios" },
      { href: `/platform/tenants/${tenantId}/invitations`, label: "Invitaciones" },
      { href: `/platform/tenants/${tenantId}/modules`, label: "Módulos" },
      { href: `/platform/tenants/${tenantId}/settings`, label: "Suscripción" },
    ] as const;
  }, [tenantId]);

  const tenantSectionTitle = activeTenant?.name ?? "Organización";
  const [tenantSectionOpen, setTenantSectionOpen] = useState(true);

  useEffect(() => {
    if (tenantLinks) setTenantSectionOpen(true);
  }, [tenantId, pathname, tenantLinks]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border/80 px-4">
        <Link
          href="/platform"
          className="inline-block rounded-md outline-none ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BloqerLogo className="h-8 max-w-[9.5rem]" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-3 pr-1">
        <div className="space-y-0.5">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plataforma
          </p>
          {PLATFORM_LINKS.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              matchExact={"matchExact" in item ? item.matchExact : undefined}
              icon={<PlatformNavIcon href={item.href} />}
            />
          ))}
        </div>

        {tenantLinks ? (
          <CollapsibleNavSection
            title={tenantSectionTitle}
            sectionIndex={1}
            open={tenantSectionOpen}
            onToggle={() => setTenantSectionOpen((v) => !v)}
            items={tenantLinks.map((item) => ({
              ...item,
              icon: <PlatformNavIcon href={item.href} tenantId={tenantId ?? undefined} />,
            }))}
          />
        ) : null}
      </nav>
      {tenantId ? (
        <div className="shrink-0 border-t border-sidebar-border/80 p-3">
          <Link
            href="/platform/tenants"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Todas las organizaciones
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
