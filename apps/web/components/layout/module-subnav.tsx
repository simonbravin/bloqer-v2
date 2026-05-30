"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type ModuleSubnavLink = {
  href: string;
  label: string;
  title?: string;
  /** `exact`: solo activo en pathname === href (p. ej. resumen de sección). */
  match?: "exact" | "prefix";
};

function linkIsActive(pathname: string, link: ModuleSubnavLink): boolean {
  if (link.match === "exact") return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function ModuleSubnav({
  links,
  ariaLabel,
  sectionLabel,
}: {
  links: ModuleSubnavLink[];
  ariaLabel: string;
  sectionLabel?: string;
}) {
  const pathname = usePathname();

  if (links.length === 0) return null;

  return (
    <nav className="space-y-2" aria-label={ariaLabel}>
      {sectionLabel ? (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{sectionLabel}</p>
      ) : null}
      <div className="flex w-full flex-wrap gap-1.5 rounded-xl border border-border/80 bg-card/80 p-1.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/50 sm:flex-nowrap">
        {links.map((l) => {
          const on = linkIsActive(pathname, l);
          return (
            <Link
              key={`${l.href}::${l.label}`}
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
