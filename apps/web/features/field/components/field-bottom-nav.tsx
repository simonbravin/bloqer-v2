"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { ClipboardList, HardHat, Home, Menu, Plus } from "lucide-react";
import { can, type PermissionModule, type UserRole } from "@bloqer/domain";
import { cn } from "@/lib/utils";
import { isFieldImmersivePath } from "@/lib/field-immersive-routes";
import { isPendingInboxPath } from "@/lib/field-pending-path";
import { useFieldProjectContext } from "@/lib/field-project-context";
import { pendingCountAriaLabel } from "@/lib/pending-count-badge";
import { usePendingInboxCount } from "@/lib/pending-inbox-count-context";
import { PendingCountBadge } from "@/components/ui/pending-count-badge";
import { FieldPlusSheet } from "./field-plus-sheet";
import { FieldMoreSheet } from "./field-more-sheet";

type Props = {
  roles: UserRole[];
  moduleGateSnapshot: Partial<Record<PermissionModule, boolean>>;
};

export function FieldBottomNav({ roles, moduleGateSnapshot }: Props) {
  const pathname = usePathname();
  const { convenienceProjectId, pathProjectId } = useFieldProjectContext();
  const { tenantCount } = usePendingInboxCount();
  const [plusOpen, setPlusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

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
              onClick={() => setPlusOpen(true)}
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
              onClick={() => setMoreOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>
      <FieldPlusSheet
        open={plusOpen}
        onOpenChange={setPlusOpen}
        roles={roles}
        moduleGateSnapshot={moduleGateSnapshot}
        convenienceProjectId={convenienceProjectId}
        onCloseAutoFocus={(event) => {
          if (!plusButtonRef.current) return;
          event.preventDefault();
          plusButtonRef.current.focus();
        }}
      />
      <FieldMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        roles={roles}
        moduleGateSnapshot={moduleGateSnapshot}
        projectId={pathProjectId}
        onCloseAutoFocus={(event) => {
          if (!moreButtonRef.current) return;
          event.preventDefault();
          moreButtonRef.current.focus();
        }}
      />
    </>
  );
}
