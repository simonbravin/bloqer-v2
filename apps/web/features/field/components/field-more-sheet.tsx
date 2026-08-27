"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useMemo } from "react";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { buildProjectWorkspaceNavSections } from "@bloqer/services/project-workspace-nav";
import { buildGlobalNavSections } from "@/lib/global-workspace-nav";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import { clearActiveTenantCookieAction } from "@/lib/auth-session-actions";
import { pendingCountAriaLabel } from "@/lib/pending-count-badge";
import { isPendingInboxPath } from "@/lib/field-pending-path";
import { usePendingInboxCount } from "@/lib/pending-inbox-count-context";
import { PendingCountBadge } from "@/components/ui/pending-count-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PROJECT_HREF_SUFFIXES = [
  { suffix: "", labelMatch: "Resumen", exact: true },
  { suffix: "/pendientes", labelMatch: "Pendientes" },
  { suffix: "/libro-obra", labelMatch: "Libro de obra" },
  { suffix: "/materiales", labelMatch: "Materiales" },
  { suffix: "/compras", labelMatch: "Tablero de compras" },
  { suffix: "/documentos", labelMatch: "Documentos" },
  { suffix: "/cronograma", labelMatch: "Cronograma" },
  { suffix: "/cuentas-por-pagar", labelMatch: "Cuentas por pagar" },
  { suffix: "/cuentas-por-cobrar", labelMatch: "Cuentas por cobrar" },
];

const GENERAL_HREFS = new Set([
  "/proyectos",
  "/directorio",
  "/finanzas/cuentas-por-pagar",
  "/finanzas/cuentas-por-cobrar",
]);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: UserRole[];
  moduleGateSnapshot: Partial<Record<PermissionModule, boolean>>;
  projectId: string | null;
};

export function FieldMoreSheet({ open, onOpenChange, roles, moduleGateSnapshot, projectId }: Props) {
  const gate = useMemo(() => tenantGateFromSnapshot(moduleGateSnapshot), [moduleGateSnapshot]);
  const projectSections = useMemo(
    () => (projectId ? buildProjectWorkspaceNavSections(projectId, gate, roles) : []),
    [projectId, gate, roles],
  );
  const globalSections = useMemo(
    () => buildGlobalNavSections(roles, (m) => gate.isEnabled(m)),
    [roles, gate],
  );
  const { tenantCount, projectCount } = usePendingInboxCount();

  const projectLinks = projectId
    ? PROJECT_HREF_SUFFIXES.map((want) => {
        const href = want.exact ? `/proyectos/${projectId}` : `/proyectos/${projectId}${want.suffix}`;
        const found = projectSections.flatMap((s) => s.items).find((item) => item.href === href);
        return found ? { href: found.href, label: want.labelMatch } : null;
      }).filter((x): x is { href: string; label: string } => x != null)
    : [];

  const fromGlobal = globalSections
    .flatMap((s) => s.items)
    .filter((item) => GENERAL_HREFS.has(item.href) || item.href === "/pendientes")
    .map((item) =>
      item.href === "/pendientes" && projectId
        ? { ...item, label: "Pendientes · todas las obras" }
        : item,
    );
  const generalLinks = [
    ...fromGlobal,
    { href: "/notificaciones", label: "Notificaciones" },
    { href: "/ayuda", label: "Ayuda" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80vh] overflow-y-auto rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        data-testid="field-more-sheet"
      >
        <SheetHeader>
          <SheetTitle>Más</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          {projectLinks.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Proyecto</h3>
              <ul className="space-y-1">
                {projectLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted"
                      onClick={() => onOpenChange(false)}
                      aria-label={
                        isPendingInboxPath(link.href) && (projectCount ?? 0) > 0
                          ? pendingCountAriaLabel(projectCount ?? 0, link.label)
                          : undefined
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">{link.label}</span>
                      {isPendingInboxPath(link.href) ? (
                        <PendingCountBadge count={projectCount ?? 0} />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">General</h3>
            <ul className="space-y-1">
              {generalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted"
                    onClick={() => onOpenChange(false)}
                    aria-label={
                      link.href === "/pendientes" && tenantCount > 0
                        ? pendingCountAriaLabel(tenantCount, link.label)
                        : undefined
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    {link.href === "/pendientes" ? <PendingCountBadge count={tenantCount} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Cuenta</h3>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/configuracion/perfil"
                  className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted"
                  onClick={() => onOpenChange(false)}
                >
                  Perfil
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-destructive hover:bg-muted"
                  onClick={() => {
                    onOpenChange(false);
                    void clearActiveTenantCookieAction().finally(() => {
                      void signOut({ callbackUrl: "/login" });
                    });
                  }}
                >
                  Cerrar sesión
                </button>
              </li>
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
