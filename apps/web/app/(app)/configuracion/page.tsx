import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { formatCurrencyDisplay } from "@/lib/format";
import {
  canEditTenantDisplaySettings,
  canReadTenantConfigArea,
  getTenantSettings,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { TenantDisplaySettingsForm } from "@/features/tenant-config/tenant-display-settings-form";
import { updateTenantDisplaySettingsAction } from "./configuracion-actions";

function countryLabel(code: string): string {
  const labels: Record<string, string> = {
    AR: "Argentina",
    UY: "Uruguay",
    PY: "Paraguay",
    CL: "Chile",
    BO: "Bolivia",
    BR: "Brasil",
    MX: "México",
    CO: "Colombia",
    PE: "Perú",
    EC: "Ecuador",
    US: "Estados Unidos",
    ES: "España",
  };
  return labels[code] ?? code;
}

export default async function ConfiguracionHomePage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const tenant = await getTenantSettings(ctx);

  const canEditDisplay = canEditTenantDisplaySettings(current.tenantCtx.roles);
  const company = tenant.primaryCompany;
  const fiscalId = company?.fiscalId ?? tenant.fiscalId;
  const legalName = company?.legalName ?? company?.name ?? null;

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
          <CardTitle className="text-base">Datos fiscales y operativos</CardTitle>
          <CardDescription>
            Identificación legal y estado del tenant. Para cambiar el nombre visible en la app, usá los ajustes de
            abajo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Nombre a mostrar (actual)</p>
            <p className="font-medium">{tenant.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Razón social</p>
            <p className="font-medium">{legalName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CUIT / identificador fiscal</p>
            <p className="font-medium">{fiscalId ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Slug (interno)</p>
            <p className="font-mono text-xs">{tenant.slug}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Zona horaria</p>
            <p>{tenant.timezone}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda base</p>
            <p>{formatCurrencyDisplay(tenant.baseCurrency)}</p>
          </div>
          {company ? (
            <>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Dirección</p>
                <p>
                  {[company.address, company.city, countryLabel(company.country)].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Teléfono</p>
                <p>{company.phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sitio web</p>
                <p>{company.website ?? "—"}</p>
              </div>
            </>
          ) : null}
          <div>
            <p className="text-muted-foreground">Estado operativo</p>
            <p>{tenant.status}</p>
          </div>
        </CardContent>
      </Card>

      {canEditDisplay ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes de visualización y contacto</CardTitle>
            <CardDescription>
              Nombre comercial visible, zona horaria, moneda base y datos de contacto editables. No podés modificar CUIT
              ni razón social desde acá.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TenantDisplaySettingsForm
              tenant={{
                name: tenant.name,
                timezone: tenant.timezone,
                baseCurrency: tenant.baseCurrency,
              }}
              company={company}
              action={updateTenantDisplaySettingsAction}
            />
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
