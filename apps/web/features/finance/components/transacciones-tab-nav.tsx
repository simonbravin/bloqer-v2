"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

export function TransaccionesTabNav({ links, defaultTab = "caja" }: { links: ModuleSubnavLink[]; defaultTab?: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = sp.get("tab") ?? defaultTab;

  return (
    <nav className="space-y-2" aria-label="Pestañas de transacciones">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/80 bg-card/80 p-1.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/50">
        {links.map((l) => {
          const linkTab = new URL(l.href, "http://local").searchParams.get("tab") ?? "";
          const on = pathname === "/finanzas/transacciones" && tab === linkTab;
          return (
            <Link
              key={l.href}
              href={l.href}
              title={l.title}
              className={cn(
                "inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                on
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
