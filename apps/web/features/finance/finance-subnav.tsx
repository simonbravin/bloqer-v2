"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FinanceSubnavLinkDTO } from "./finance-subnav-links";
import { cn } from "@/lib/utils";

function linkIsActive(pathname: string, href: string): boolean {
  if (href === "/finanzas") return pathname === "/finanzas";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FinanceSubnav({ links }: { links: FinanceSubnavLinkDTO[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-2" aria-label="Navegación de finanzas">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Finanzas empresa</p>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/80 bg-card/80 p-1.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/50">
        {links.map((l) => {
          const on = linkIsActive(pathname, l.href);
          return (
            <Link
              key={`${l.href}::${l.label}`}
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
