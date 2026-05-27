import { notFound, redirect } from "next/navigation";
import { OVERVIEW_ROLES } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { canEditTeamMembership, canReadTenantConfigArea } from "@bloqer/services";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenantInvitationAction } from "../invitation-actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
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
    <PageShell variant="form" className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <PageBackLink href="/configuracion/equipo" label="Equipo" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invitar usuario</h1>
        <p className="text-sm text-muted-foreground">
          Si el correo se envía correctamente, el invitado lo recibe con el enlace. Si no se pudo
          enviar (correo desactivado, URL pública de la app mal configurada o error del proveedor),
          vas a poder copiar el enlace en el detalle de la invitación.
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
        <div className="grid gap-2">
          <Label htmlFor="expiresInDays">Vencimiento (días)</Label>
          <Input
            id="expiresInDays"
            name="expiresInDays"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            className="max-w-[120px]"
          />
          <p className="text-xs text-muted-foreground">Entre 1 y 30 días (por defecto 7).</p>
        </div>
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
