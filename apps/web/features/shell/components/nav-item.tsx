"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItemProps {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** When true, only an exact pathname match is active (e.g. project root “Resumen”). */
  matchExact?: boolean;
}

export function NavItem({ href, label, icon, matchExact }: NavItemProps) {
  const pathname = usePathname();
  const isActive = matchExact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
