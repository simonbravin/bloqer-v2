import { notFound, redirect } from "next/navigation";
import { OVERVIEW_ROLES } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { canEditTeamMembership, canReadTenantConfigArea } from "@bloqer/services";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenantInvitationAction } from "../invitation-actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

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
      <div className="flex flex-wrap gap-2">
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invitar usuario</h1>
        <p className="text-sm text-muted-foreground">
          El invitado comparte el plan y la prueba de <span className="font-medium text-foreground">esta organización</span>.
          Si el correo se envía correctamente, recibe el enlace. Si no, podés copiarlo en el detalle de la invitación.
        </p>
      </div>
      {errMsg ? (
        <p className="text-sm text-destructive" role="alert">
          {errMsg}
        </p>
      ) : null}

      <form
        action={createTenantInvitationAction}
        className="space-y-4 rounded-lg border bg-card p-4"
      >
        <div className="grid gap-2">
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
          <p className="text-sm font-medium">Roles</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {OVERVIEW_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`role_${role}`}
                  className="h-4 w-4 rounded border border-input"
                />
                <span>{role}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Marcá al menos un rol.</p>
        </div>
        <Button type="submit">Crear invitación</Button>
      </form>
    </PageShell>
  );
}
