"use client";

import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Fixed sidebar footer link — always visible, outside nav scroll ([D-090]). */
export function HelpSidebarFooter() {
  const pathname = usePathname();
  const active = pathname === "/ayuda" || pathname.startsWith("/ayuda/");

  return (
    <div className="shrink-0 border-t border-sidebar-border/80 px-2 py-2">
      <Link
        href="/ayuda"
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )}
      >
        <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
        Ayuda
      </Link>
    </div>
  );
}
