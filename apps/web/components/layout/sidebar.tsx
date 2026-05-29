"use client";

import Link from "next/link";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CollapsibleNavSection } from "@/features/shell/components/collapsible-nav-section";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { buildGlobalNavSections } from "@/lib/global-workspace-nav";
import { GlobalNavIcon } from "@/lib/global-nav-icons";

function isNavItemActive(pathname: string, href: string, matchExact?: boolean) {
  return matchExact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarProps {
  /** Membership roles; empty = only items without `require` (e.g. Inicio) */
  roles: UserRole[];
  /** Phase 12B / 15A: serialized tenant module flags (default-on when key missing). */
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
}

export function Sidebar({ roles, moduleGateSnapshot }: SidebarProps) {
  const pathname = usePathname();
  const gate = useMemo(() => tenantGateFromSnapshot(moduleGateSnapshot ?? {}), [moduleGateSnapshot]);
  const sections = useMemo(
    () => buildGlobalNavSections(roles, (m) => gate.isEnabled(m)),
    [roles, gate],
  );

  const [openByTitle, setOpenByTitle] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenByTitle((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of sections) {
        const hasActive = s.items.some((item) => isNavItemActive(pathname, item.href, item.matchExact));
        next[s.title] = hasActive ? true : (prev[s.title] ?? false);
      }
      return next;
    });
  }, [pathname, sections]);

  return (
    <aside className="flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border/80 px-4">
        <Link
          href="/dashboard"
          className="inline-block rounded-md outline-none ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BloqerLogo priority className="h-8 max-w-[9.5rem]" />
        </Link>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain px-2 py-3 pr-1">
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
                icon: <GlobalNavIcon href={item.href} />,
              }))}
            />
          );
        })}
      </nav>
    </aside>
  );
}
