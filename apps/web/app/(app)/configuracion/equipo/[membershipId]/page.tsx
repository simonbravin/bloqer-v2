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
import { PageListHeader } from "@/components/ui/page-list-header";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  updateTenantMemberRolesAction,
  updateTenantMemberStatusAction,
} from "../../configuracion-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ membershipId: string }>;
}

function membershipStatusLabel(s: string) {
  return s === "ACTIVE" ? "Activo" : "Inactivo";
}

const selectClassName = cn(
  "flex h-10 w-full min-w-[10rem] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

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
    <PageShell variant="form" className="space-y-6" breadcrumbLabel={member.name ?? member.email}>
      <PageListHeader title="Miembro" subtitle={member.email} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del miembro</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailFieldGrid>
            <DetailField label="Nombre">{member.name ?? "—"}</DetailField>
            <DetailField label="Estado">{membershipStatusLabel(member.status)}</DetailField>
            <DetailField label="Alta">{formatDateTime(member.createdAt)}</DetailField>
            <DetailField label="Roles">{member.roles.join(", ") || "—"}</DetailField>
          </DetailFieldGrid>
        </CardContent>
      </Card>

      {canEdit ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roles</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateTenantMemberRolesAction} className="space-y-4">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado de membresía</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                action={updateTenantMemberStatusAction}
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="membershipId" value={member.membershipId} />
                <div className="space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={member.status}
                    className={selectClassName}
                  >
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                  </select>
                </div>
                <Button type="submit" size="sm" variant="secondary">
                  Guardar estado
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No tenés permisos para editar roles o estado.
        </p>
      )}
    </PageShell>
  );
}
