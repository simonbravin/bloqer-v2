"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClipboardList, HardHat, Home, Menu, Plus } from "lucide-react";
import { can, type PermissionModule, type UserRole } from "@bloqer/domain";
import { cn } from "@/lib/utils";
import { isFieldImmersivePath } from "@/lib/field-immersive-routes";
import { isPendingInboxPath } from "@/lib/field-pending-path";
import { useFieldProjectContext } from "@/lib/field-project-context";
import { pendingCountAriaLabel } from "@/lib/pending-count-badge";
import { usePendingInboxCount } from "@/lib/pending-inbox-count-context";
import { MD_UP_QUERY, useMediaQuery } from "@/lib/media-query";
import { focusShellSidebarToggle } from "@/components/layout/sidebar-shell-context";
import { PendingCountBadge } from "@/components/ui/pending-count-badge";
import { FieldPlusSheet } from "./field-plus-sheet";
import { FieldMoreSheet } from "./field-more-sheet";

type Props = {
  roles: UserRole[];
  moduleGateSnapshot: Partial<Record<PermissionModule, boolean>>;
};

function restoreFieldMenuFocus(event: Event, trigger: HTMLButtonElement | null) {
  event.preventDefault();
  if (trigger?.getClientRects().length) trigger.focus();
  else focusShellSidebarToggle();
}

export function FieldBottomNav({ roles, moduleGateSnapshot }: Props) {
  const pathname = usePathname();
  const isMdUp = useMediaQuery(MD_UP_QUERY);
  const { convenienceProjectId, pathProjectId } = useFieldProjectContext();
  const { tenantCount } = usePendingInboxCount();
  const [openMenu, setOpenMenu] = useState<{ kind: "plus" | "more"; pathname: string } | null>(null);
  const plusOpen = openMenu?.pathname === pathname && openMenu.kind === "plus";
  const moreOpen = openMenu?.pathname === pathname && openMenu.kind === "more";
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname, isMdUp]);

  if (isFieldImmersivePath(pathname)) return null;

  const obraHref = pathProjectId ? `/proyectos/${pathProjectId}` : "/proyectos";
  const canViewProjects = moduleGateSnapshot.PROJECTS !== false && can(roles, "VIEW", "PROJECTS");
  const homeActive = pathname === "/dashboard";
  const pendingActive = isPendingInboxPath(pathname);
  const obraActive = (pathname === "/proyectos" || pathname.startsWith("/proyectos/")) && !pendingActive;
  const obraClassName = cn(
    "flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px]",
    obraActive ? "font-semibold text-foreground" : "text-muted-foreground",
  );

  return (
    <>
      <nav
        aria-label="Navegación de campo"
        data-testid="field-bottom-nav"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5 items-end">
          <li>
            <Link
              href="/dashboard"
              aria-current={homeActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px]",
                homeActive ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <Home className="h-5 w-5" aria-hidden />
              Inicio
            </Link>
          </li>
          <li>
            {canViewProjects ? (
              <Link
                href={obraHref}
                aria-current={obraActive ? "page" : undefined}
                aria-label="Obra"
                className={obraClassName}
              >
                <HardHat className="h-5 w-5" aria-hidden />
                Obra
              </Link>
            ) : (
              <span aria-disabled="true" title="Proyectos no habilitados" className={cn(obraClassName, "opacity-50")}>
                <HardHat className="h-5 w-5" aria-hidden />
                Obra
              </span>
            )}
          </li>
          <li className="flex justify-center">
            <button
              type="button"
              ref={plusButtonRef}
              aria-label="Registrar"
              aria-haspopup="dialog"
              aria-expanded={plusOpen}
              data-testid="field-plus-button"
              className="-mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
              onClick={() => setOpenMenu({ kind: "plus", pathname })}
            >
              <Plus className="h-6 w-6" aria-hidden />
            </button>
          </li>
          <li>
            <Link
              href="/pendientes"
              aria-current={pendingActive ? "page" : undefined}
              aria-label={tenantCount > 0 ? pendingCountAriaLabel(tenantCount) : undefined}
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px]",
                pendingActive ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <ClipboardList className="h-5 w-5" aria-hidden />
                <PendingCountBadge count={tenantCount} density="compact" />
              </span>
              Pendientes
            </Link>
          </li>
          <li>
            <button
              type="button"
              ref={moreButtonRef}
              aria-label="Más"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              data-testid="field-more-button"
              className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px] text-muted-foreground"
              onClick={() => setOpenMenu({ kind: "more", pathname })}
            >
              <Menu className="h-5 w-5" aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>
      {!isMdUp ? (
        <>
          <FieldPlusSheet
            key={pathname}
            open={plusOpen}
            onOpenChange={(open) => setOpenMenu(open ? { kind: "plus", pathname } : null)}
            roles={roles}
            moduleGateSnapshot={moduleGateSnapshot}
            convenienceProjectId={convenienceProjectId}
            onCloseAutoFocus={(event) => restoreFieldMenuFocus(event, plusButtonRef.current)}
          />
          <FieldMoreSheet
            open={moreOpen}
            onOpenChange={(open) => setOpenMenu(open ? { kind: "more", pathname } : null)}
            roles={roles}
            moduleGateSnapshot={moduleGateSnapshot}
            projectId={pathProjectId}
            onCloseAutoFocus={(event) => restoreFieldMenuFocus(event, moreButtonRef.current)}
          />
        </>
      ) : null}
    </>
  );
}
