"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-link-active";

interface NavItemProps {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** When true, only an exact pathname match is active (e.g. project root “Resumen”). */
  matchExact?: boolean;
  /** When pathname matches this prefix, treat the item as active (e.g. pagos → facturas proveedor). */
  activeWhenPathPrefix?: string;
}

export function NavItem({ href, label, icon, matchExact, activeWhenPathPrefix }: NavItemProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isActive = isNavLinkActive(pathname, searchParams, href, {
    matchExact,
    activeWhenPathPrefix,
  });

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
        "outline-none ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "border border-primary/25 bg-primary/12 font-semibold text-primary shadow-sm"
          : "border border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {icon ? <span className="shrink-0 text-current">{icon}</span> : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}
