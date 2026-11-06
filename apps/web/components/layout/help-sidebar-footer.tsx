"use client";

import { CircleHelp } from "lucide-react";
import { NavItem } from "@/features/shell/components/nav-item";

/** Fixed sidebar footer link — always visible, outside nav scroll ([D-090]). */
export function HelpSidebarFooter() {
  return (
    <div className="shrink-0 border-t border-sidebar-border/80 px-2 py-2">
      <NavItem href="/ayuda" label="Ayuda" icon={<CircleHelp className="h-4 w-4" aria-hidden />} />
    </div>
  );
}
