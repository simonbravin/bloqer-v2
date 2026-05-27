import type { PermissionModule } from "@bloqer/domain";
import {
  getPermissionModuleGroupSections,
  TENANT_MODULE_LABEL_ES,
} from "@bloqer/domain";
import { notFound, redirect } from "next/navigation";
import { PermissionMatrixOverview } from "@/features/tenant-config";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { PageShell } from "@/components/layout/page-shell";
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
  const canEditNotes = canEditPermissionMatrixNotes(current.tenantCtx.roles);
  const moduleLabelsEs = TENANT_MODULE_LABEL_ES as Record<PermissionModule, string>;

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Permisos</h1>
        <p className="text-sm text-muted-foreground max-w-prose">
          Techo efectivo por rol y módulo según <code className="text-xs">can()</code> (VIEW ⊆ EDIT ⊆ APROBAR).
          Agrupado por área para lectura rápida. Las notas son internas del tenant y{" "}
          <strong className="text-foreground">no modifican</strong> los permisos reales (siguen en equipo /
          invitaciones).
        </p>
      </div>

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
