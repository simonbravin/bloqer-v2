import { formatDateTime } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { OVERVIEW_ROLES } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canEditTeamMembership,
  canReadTenantConfigArea,
  getTenantMemberById,
  ServiceError,
} from "@bloqer/services";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import {
  updateTenantMemberRolesAction,
  updateTenantMemberStatusAction,
} from "../../configuracion-actions";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ membershipId: string }>;
}

function membershipStatusLabel(s: string) {
  return s === "ACTIVE" ? "Activo" : "Inactivo";
}

export default async function ConfiguracionEquipoDetallePage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const { membershipId } = await params;
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  let member;
  try {
    member = await getTenantMemberById(membershipId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const canEdit = canEditTeamMembership(current.tenantCtx.roles);

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <PageBackLink href="/configuracion/equipo" label="Equipo" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Miembro</h1>
        <p className="text-sm text-muted-foreground">{member.email}</p>
      </div>

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Nombre</dt>
          <dd>{member.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Estado</dt>
          <dd>{membershipStatusLabel(member.status)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Alta</dt>
          <dd>{formatDateTime(member.createdAt)}</dd>
        </div>
      </dl>

      {canEdit ? (
        <>
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Roles</h2>
            <form action={updateTenantMemberRolesAction} className="space-y-3">
              <input type="hidden" name="membershipId" value={member.membershipId} />
              <div className="grid gap-2 sm:grid-cols-2">
                {OVERVIEW_ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`role_${role}`}
                      defaultChecked={member.roles.includes(role)}
                      className="h-4 w-4 rounded border border-input"
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>
              <Button type="submit" size="sm">
                Guardar roles
              </Button>
            </form>
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Estado de membresía</h2>
            <form
              action={updateTenantMemberStatusAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="membershipId" value={member.membershipId} />
              <div className="grid gap-1">
                <Label htmlFor="status">Estado</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={member.status}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </div>
              <Button type="submit" size="sm" variant="secondary">
                Guardar estado
              </Button>
            </form>
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No tenés permisos para editar roles o estado.
        </p>
      )}
    </PageShell>
  );
}
