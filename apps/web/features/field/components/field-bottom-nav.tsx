"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ClipboardList, HardHat, Home, Menu, Plus } from "lucide-react";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { cn } from "@/lib/utils";
import { isFieldImmersivePath } from "@/lib/field-immersive-routes";
import { isPendingInboxPath } from "@/lib/field-pending-path";
import { useFieldProjectContext } from "@/lib/field-project-context";
import { FieldPlusSheet } from "./field-plus-sheet";
import { FieldMoreSheet } from "./field-more-sheet";

type Props = {
  pendingCount: number;
  roles: UserRole[];
  moduleGateSnapshot: Partial<Record<PermissionModule, boolean>>;
};

function badgeLabel(n: number): string {
  if (n <= 0) return "";
  return n > 9 ? "9+" : String(n);
}

export function FieldBottomNav({ pendingCount, roles, moduleGateSnapshot }: Props) {
  const pathname = usePathname();
  const { convenienceProjectId } = useFieldProjectContext();
  const [plusOpen, setPlusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (isFieldImmersivePath(pathname)) return null;

  const obraHref = convenienceProjectId ? `/proyectos/${convenienceProjectId}` : "/proyectos";
  const homeActive = pathname === "/dashboard";
  const pendingActive = isPendingInboxPath(pathname);
  const obraActive = pathname.startsWith("/proyectos/") && !pendingActive;
  const badge = badgeLabel(pendingCount);

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
            <Link
              href={obraHref}
              aria-current={obraActive ? "page" : undefined}
              aria-label="Obra"
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px]",
                obraActive ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <HardHat className="h-5 w-5" aria-hidden />
              Obra
            </Link>
          </li>
          <li className="flex justify-center">
            <button
              type="button"
              aria-label="Registrar"
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
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px]",
                pendingActive ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <ClipboardList className="h-5 w-5" aria-hidden />
                {badge ? (
                  <span className="absolute -right-2 -top-1 rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground">
                    {badge}
                  </span>
                ) : null}
              </span>
              Pendientes
            </Link>
          </li>
          <li>
            <button
              type="button"
              aria-label="Más"
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
      />
      <FieldMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        roles={roles}
        moduleGateSnapshot={moduleGateSnapshot}
        projectId={convenienceProjectId}
      />
    </>
  );
}
