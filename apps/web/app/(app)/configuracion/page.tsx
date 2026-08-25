import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { formatCurrencyDisplay } from "@/lib/format";
import { formatTimezoneOptionLabel } from "@bloqer/utils";
import {
  canEditTenantDisplaySettings,
  canReadTenantConfigArea,
  getTenantSettings,
} from "@bloqer/services";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";
import { TenantDisplaySettingsForm } from "@/features/tenant-config/tenant-display-settings-form";
import { TenantLogoSettings } from "@/features/tenant-config/tenant-logo-settings";
import { formatIvaConditionLabel } from "@bloqer/domain";
import {
  updateTenantDisplaySettingsAction,
  uploadTenantLogoAction,
  removeTenantLogoAction,
} from "./configuracion-actions";

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
  const addressLine = company
    ? [company.address, company.city, countryLabel(company.country)].filter(Boolean).join(", ") ||
      "—"
    : null;

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Configuración"
        subtitle="Datos de la organización, marca y preferencias de visualización."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos fiscales y operativos</CardTitle>
          <CardDescription>
            Resumen de solo lectura. Nombre a mostrar, zona y moneda se editan abajo si tenés
            permiso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DetailFieldGrid>
            <DetailField label="Nombre a mostrar">{tenant.name}</DetailField>
            <DetailField label="Razón social">{legalName ?? "—"}</DetailField>
            <DetailField label="CUIT / identificador fiscal">{fiscalId ?? "—"}</DetailField>
            <DetailField label="Condición frente al IVA">
              {formatIvaConditionLabel(company?.ivaCondition)}
            </DetailField>
            <DetailField label="Slug (interno)">
              <span className="font-mono text-xs">{tenant.slug}</span>
            </DetailField>
            <DetailField label="Zona horaria">
              {formatTimezoneOptionLabel(tenant.timezone)}
            </DetailField>
            <DetailField label="Moneda base">
              {formatCurrencyDisplay(tenant.baseCurrency)}
            </DetailField>
            {company ? (
              <>
                <DetailField label="Dirección" fullWidth>
                  {addressLine}
                </DetailField>
                <DetailField label="Teléfono">{company.phone ?? "—"}</DetailField>
                <DetailField label="Sitio web">{company.website ?? "—"}</DetailField>
              </>
            ) : null}
            <DetailField label="Estado operativo">{tenant.status}</DetailField>
          </DetailFieldGrid>
        </CardContent>
      </Card>

      {canEditDisplay ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ajustes de visualización y contacto</CardTitle>
              <CardDescription>
                Nombre a mostrar, zona horaria, moneda base y datos de contacto de la empresa
                principal.
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo de la empresa</CardTitle>
              <CardDescription>
                Reemplaza el logo de Bloqer en el menú lateral y aparece en los PDF exportados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TenantLogoSettings
                hasLogo={tenant.hasLogo}
                logoVersion={tenant.logoVersion}
                uploadAction={uploadTenantLogoAction}
                removeAction={removeTenantLogoAction}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}
