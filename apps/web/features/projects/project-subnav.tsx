"use client";

/**
 * Subnavegación horizontal de proyecto (Phase 14C).
 *
 * **Integración:** `apps/web/app/(app)/proyectos/[id]/layout.tsx` obtiene `getTenantModuleGate` + roles y pasa `items` desde {@link buildProjectSubnavLinks}.
 *
 * **Rutas aún no creadas** (no incluir en `items` hasta que existan las páginas):
 * - `/proyectos/[id]/finanzas`
 * - `/proyectos/[id]/cronograma`
 * - `/proyectos/[id]/reportes`
 *
 * @see docs/bloqer2.0/08-architecture/FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ProjectSubnavLink } from "./project-subnav-config";

export type { ProjectSubnavLink };

export function ProjectSubnav({ items }: { items: ProjectSubnavLink[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;

  return (
    <nav aria-label="Secciones del proyecto" className="-mx-1 border-b bg-muted/20">
      <ul className="flex min-h-11 flex-nowrap gap-1 overflow-x-auto px-1 py-1 sm:flex-wrap">
        {items.map((item) => {
          const active =
            item.label === "Resumen"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={`${item.label}-${item.href}`} className="shrink-0">
              <Link
                href={item.href}
                className={cn(
                  "inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
