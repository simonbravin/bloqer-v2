import Image from "next/image";
import Link from "next/link";
import { NavItem } from "@/features/shell/components/nav-item";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { filterMainNav } from "@/lib/nav-config";

interface SidebarProps {
  tenantName?: string;
  /** Membership roles; empty = only items without `require` (e.g. Inicio) */
  roles: UserRole[];
  /** Phase 12B: optional tenant module gate from server layout */
  tenantModuleIsEnabled?: (module: PermissionModule) => boolean;
}

export function Sidebar({ tenantName, roles, tenantModuleIsEnabled }: SidebarProps) {
  const mainNav = filterMainNav(roles, { isTenantModuleEnabled: tenantModuleIsEnabled });

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-background px-3 py-4">
      <div className="mb-6 px-3">
        <Link href="/dashboard" className="inline-block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
          <Image
            src="/bloqer-logo.png"
            alt="Bloqer"
            width={140}
            height={40}
            priority
            className="h-8 w-auto max-w-[9.5rem] object-contain object-left"
          />
        </Link>
        {tenantName && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{tenantName}</p>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {mainNav.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
    </aside>
  );
}
