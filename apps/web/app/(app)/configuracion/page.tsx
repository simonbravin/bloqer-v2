import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canEditTenantDisplaySettings,
  canReadTenantConfigArea,
  getTenantSettings,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantDisplaySettingsAction } from "./configuracion-actions";
import { PageShell } from "@/components/layout/page-shell";

export default async function ConfiguracionHomePage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const tenant = await getTenantSettings(ctx);

  const canEditDisplay = canEditTenantDisplaySettings(current.tenantCtx.roles);

  return (
    <PageShell variant="default" className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Ajustes del tenant y administración del equipo.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipo</CardTitle>
            <CardDescription>Miembros, roles y estado de membresía.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" asChild>
              <Link href="/configuracion/equipo">Ir a equipo</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permisos</CardTitle>
            <CardDescription>Matriz de referencia por rol (solo lectura).</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" asChild>
              <Link href="/configuracion/permisos">Ver permisos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del tenant</CardTitle>
          <CardDescription>Identificación básica (slug no editable desde acá).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Nombre</p>
            <p className="font-medium">{tenant.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Slug</p>
            <p className="font-mono text-xs">{tenant.slug}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Zona horaria</p>
            <p>{tenant.timezone}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda base</p>
            <p>{tenant.baseCurrency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CUIT / identificador fiscal</p>
            <p>{tenant.fiscalId ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Estado operativo</p>
            <p>{tenant.status}</p>
          </div>
        </CardContent>
      </Card>

      {canEditDisplay ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes de visualización</CardTitle>
            <CardDescription>Nombre comercial, zona horaria y moneda base.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateTenantDisplaySettingsAction} className="grid max-w-md gap-4">
              <div className="grid gap-1">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" name="name" defaultValue={tenant.name} maxLength={120} required />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="timezone">Zona horaria</Label>
                <Input id="timezone" name="timezone" defaultValue={tenant.timezone} maxLength={64} required />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="baseCurrency">Moneda base (ISO 4217, 3 letras)</Label>
                <Input id="baseCurrency" name="baseCurrency" defaultValue={tenant.baseCurrency} maxLength={3} required />
              </div>
              <Button type="submit" size="sm">
                Guardar
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
