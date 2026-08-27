import { notFound, redirect } from "next/navigation";
import { OVERVIEW_ROLES } from "@bloqer/domain";
import { formatUserRoleLabel } from "@/lib/user-role-label";
import { getCurrentUser } from "@/lib/auth";
import { canEditTeamMembership, canReadTenantConfigArea } from "@bloqer/services";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenantInvitationAction } from "../invitation-actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ err?: string }>;
}

export default async function ConfiguracionEquipoInvitarPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();
  if (!canEditTeamMembership(current.tenantCtx.roles)) notFound();

  const sp = await searchParams;
  let errMsg: string | null = null;
  if (sp.err) {
    try {
      errMsg = decodeURIComponent(sp.err);
    } catch {
      errMsg = sp.err;
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Invitar usuario"
        subtitle={
          <>
            El invitado comparte el plan y la prueba de{" "}
            <span className="font-medium text-foreground">esta organización</span>. Si el correo se
            envía correctamente, recibe el enlace. Si no, podés copiarlo en el detalle de la
            invitación.
          </>
        }
      />
      {errMsg ? (
        <p className="text-sm text-destructive" role="alert">
          {errMsg}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva invitación</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTenantInvitationAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="nombre@empresa.com"
              />
            </div>
            <input type="hidden" name="expiresInDays" value="7" />
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {OVERVIEW_ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`role_${role}`}
                      className="h-4 w-4 rounded border border-input"
                    />
                    <span>{formatUserRoleLabel(role)}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Marcá al menos un rol.</p>
            </div>
            <Button type="submit">Crear invitación</Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
