"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-link-active";
import { PendingCountBadge } from "@/components/ui/pending-count-badge";
import { pendingCountAriaLabel } from "@/lib/pending-count-badge";
import { isPendingInboxPath } from "@/lib/field-pending-path";

interface NavItemProps {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** When true, only an exact pathname match is active (e.g. project root “Resumen”). */
  matchExact?: boolean;
  /** When pathname matches this prefix, treat the item as active (e.g. pagos → facturas proveedor). */
  activeWhenPathPrefix?: string;
  badgeCount?: number;
}

export function NavItem({ href, label, icon, matchExact, activeWhenPathPrefix, badgeCount }: NavItemProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isActive = isNavLinkActive(pathname, searchParams, href, {
    matchExact,
    activeWhenPathPrefix,
  });
  const count = badgeCount ?? 0;
  const pendingHref = isPendingInboxPath(href.split("?")[0] ?? href);

  return (
    <Link
      href={href}
      aria-label={pendingHref && count > 0 ? pendingCountAriaLabel(count, label) : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
        "outline-none ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "border border-primary/25 bg-primary/12 font-semibold text-primary shadow-sm"
          : "border border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {icon ? <span className="shrink-0 text-current">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <PendingCountBadge count={count} />
    </Link>
  );
}
