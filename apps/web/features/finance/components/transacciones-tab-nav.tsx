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
      <div className="flex w-full flex-wrap gap-1.5 rounded-xl border border-border/80 bg-card/80 p-1.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/50 sm:flex-nowrap">
        {links.map((l) => {
          const linkTab = new URL(l.href, "http://local").searchParams.get("tab") ?? "";
          const on = pathname === "/finanzas/transacciones" && tab === linkTab;
          return (
            <Link
              key={l.href}
              href={l.href}
              title={l.title}
              className={cn(
                "inline-flex min-h-9 min-w-0 flex-1 basis-[calc(50%-0.375rem)] items-center justify-center rounded-lg px-2 py-1.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:basis-0 sm:px-3",
                on
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <span className="truncate">{l.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
