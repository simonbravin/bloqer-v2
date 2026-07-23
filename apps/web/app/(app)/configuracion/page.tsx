import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { formatCurrencyDisplay } from "@/lib/format";
import {
  canEditTenantDisplaySettings,
  canReadTenantConfigArea,
  getTenantSettings,
} from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { TenantDisplaySettingsForm } from "@/features/tenant-config/tenant-display-settings-form";
import { updateTenantDisplaySettingsAction } from "./configuracion-actions";
import { ShoppingCart } from "lucide-react";

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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos fiscales y operativos</CardTitle>
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

      <Card>
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ShoppingCart className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-base">Política de compras</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/configuracion/compras">Abrir configuración de compras</Link>
          </Button>
        </CardContent>
      </Card>

      {canEditDisplay ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes de visualización y contacto</CardTitle>
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
