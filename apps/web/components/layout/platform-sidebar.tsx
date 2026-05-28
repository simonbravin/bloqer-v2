"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { CollapsibleNavSection } from "@/features/shell/components/collapsible-nav-section";
import { usePlatformNav } from "@/features/platform/platform-nav-context";
import { PlatformNavIcon } from "@/lib/platform-nav-icons";

function isNavItemActive(pathname: string, href: string, matchExact?: boolean) {
  return matchExact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

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
  const tenantLinks = tenantId
    ? [
        { href: `/platform/tenants/${tenantId}`, label: "Resumen", matchExact: true as const },
        { href: `/platform/tenants/${tenantId}/users`, label: "Usuarios" },
        { href: `/platform/tenants/${tenantId}/invitations`, label: "Invitaciones" },
        { href: `/platform/tenants/${tenantId}/modules`, label: "Módulos" },
        { href: `/platform/tenants/${tenantId}/settings`, label: "Suscripción" },
      ]
    : [];

  const sections = useMemo(
    () => [
      { title: "Plataforma", items: PLATFORM_LINKS },
      ...(tenantLinks.length > 0
        ? [
            {
              title: activeTenant?.name ?? "Organización",
              items: tenantLinks,
            },
          ]
        : []),
    ],
    [tenantLinks, activeTenant?.name],
  );

  const [openByTitle, setOpenByTitle] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenByTitle((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of sections) {
        const hasActive = s.items.some((item) =>
          isNavItemActive(pathname, item.href, "matchExact" in item ? item.matchExact : undefined),
        );
        next[s.title] = hasActive ? true : (prev[s.title] ?? s.title === "Plataforma");
      }
      return next;
    });
  }, [pathname, sections]);

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
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3 pr-1">
        {sections.map((section, sectionIndex) => {
          const open = openByTitle[section.title] ?? false;
          return (
            <CollapsibleNavSection
              key={section.title}
              title={section.title}
              sectionIndex={sectionIndex}
              open={open}
              onToggle={() =>
                setOpenByTitle((prev) => ({
                  ...prev,
                  [section.title]: !(prev[section.title] ?? false),
                }))
              }
              items={section.items.map((item) => ({
                ...item,
                icon: <PlatformNavIcon href={item.href} tenantId={tenantId ?? undefined} />,
              }))}
            />
          );
        })}
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
