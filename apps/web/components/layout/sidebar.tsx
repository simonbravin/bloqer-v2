"use client";

import Image from "next/image";
import Link from "next/link";
import { NavItem } from "@/features/shell/components/nav-item";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { filterMainNav } from "@/lib/nav-config";

interface SidebarProps {
  tenantName?: string;
  /** Membership roles; empty = only items without `require` (e.g. Inicio) */
  roles: UserRole[];
  /** Phase 12B / 15A: serialized tenant module flags (default-on when key missing). */
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
}

export function Sidebar({ tenantName, roles, moduleGateSnapshot }: SidebarProps) {
  const gate = tenantGateFromSnapshot(moduleGateSnapshot ?? {});
  const mainNav = filterMainNav(roles, { isTenantModuleEnabled: (m) => gate.isEnabled(m) });

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border/80 px-4 py-5">
        <Link
          href="/dashboard"
          className="inline-block rounded-md outline-none ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/bloqer-logo.png"
            alt="Bloqer"
            width={140}
            height={40}
            priority
            className="h-8 w-auto max-w-[9.5rem] object-contain object-left"
          />
        </Link>
        {tenantName ? (
          <p className="mt-2 truncate text-xs font-medium leading-snug text-muted-foreground" title={tenantName}>
            {tenantName}
          </p>
        ) : null}
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {mainNav.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
    </aside>
  );
}
