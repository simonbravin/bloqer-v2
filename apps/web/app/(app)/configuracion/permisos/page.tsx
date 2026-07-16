import type { PermissionModule } from "@bloqer/domain";
import {
  can,
  getPermissionModuleGroupSections,
  getUnavailablePermissionModulesForUi,
  TENANT_MODULE_LABEL_ES,
} from "@bloqer/domain";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PermissionMatrixOverview } from "@/features/tenant-config";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  canEditPermissionMatrixNotes,
  canReadTenantConfigArea,
  getPermissionMatrixOverview,
  getTenantPermissionMatrixNotes,
  ServiceError,
} from "@bloqer/services";

export default async function ConfiguracionPermisosPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  let matrix: Awaited<ReturnType<typeof getPermissionMatrixOverview>>;
  let notes: Awaited<ReturnType<typeof getTenantPermissionMatrixNotes>>;
  try {
    [matrix, notes] = await Promise.all([
      getPermissionMatrixOverview(ctx),
      getTenantPermissionMatrixNotes(ctx),
    ]);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "FORBIDDEN" || e.code === "NOT_FOUND")) notFound();
    throw e;
  }

  const sections = getPermissionModuleGroupSections();
  const unavailableModules = getUnavailablePermissionModulesForUi();
  const canEditNotes = canEditPermissionMatrixNotes(current.tenantCtx.roles);
  const moduleLabelsEs = TENANT_MODULE_LABEL_ES as Record<PermissionModule, string>;
  const canOpenEquipo =
    can(current.tenantCtx.roles, "VIEW", "TENANT_SETTINGS") ||
    can(current.tenantCtx.roles, "VIEW", "USERS_PERMISSIONS");

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Permisos</h1>
        <p className="text-sm text-muted-foreground max-w-prose">
          Vista informativa del techo efectivo por rol y módulo (VER ⊆ EDITAR ⊆ APROBAR).
        </p>
      </div>

      <div
        role="note"
        className="space-y-2 rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
      >
        <p>
          Esta pantalla es <strong className="text-foreground">solo lectura</strong>: no se editan
          permisos individuales desde acá. Los permisos se derivan de los{" "}
          <strong className="text-foreground">roles</strong> asignados a cada miembro.
        </p>
        <p>
          Para dar o quitar acceso, asigná roles desde{" "}
          {canOpenEquipo ? (
            <Link
              href="/configuracion/equipo"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Equipo
            </Link>
          ) : (
            <span className="font-medium text-foreground">Equipo</span>
          )}
          . Las notas internas de esta matriz no cambian los permisos reales.
        </p>
        {canOpenEquipo ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/configuracion/equipo">Ir a Equipo</Link>
          </Button>
        ) : null}
      </div>

      {unavailableModules.length > 0 ? (
        <div
          role="note"
          className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <p className="font-medium">No disponibles en esta versión</p>
          <p className="text-amber-900/90 dark:text-amber-100/90">
            Estos módulos figuran en el modelo de permisos para etapas futuras, pero{" "}
            <strong>no tienen pantallas ni flujos operativos</strong> hoy. No asignes expectativas de
            uso sobre ellos:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {unavailableModules.map((m) => (
              <li key={m.moduleKey}>
                <span className="font-medium">{m.labelEs}</span>{" "}
                <span className="font-mono text-xs opacity-80">({m.moduleKey})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PermissionMatrixOverview
        sections={sections}
        matrix={matrix}
        moduleLabelsEs={moduleLabelsEs}
        notes={notes}
        canEditNotes={canEditNotes}
      />
    </PageShell>
  );
}
