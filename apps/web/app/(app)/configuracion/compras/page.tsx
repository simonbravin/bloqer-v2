import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { canReadTenantConfigArea } from "@bloqer/services";
import {
  getCompanies,
  getCompanyProcurementSettings,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CompanyProcurementSettingsForm } from "@/features/procurement/components/company-procurement-settings-form";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<{ companyId?: string }>;
}

const selectClassName = cn(
  "flex h-10 min-w-[240px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export default async function ConfiguracionComprasPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const companies = await getCompanies(ctx);
  if (companies.length === 0) notFound();

  const companyId =
    sp.companyId ?? ctx.companyId ?? companies[0]!.id;
  const company = companies.find((c) => c.id === companyId) ?? companies[0]!;
  const settings = await getCompanyProcurementSettings(company.id, ctx);

  const canEdit =
    can(current.tenantCtx.roles, "EDIT", "TENANT_SETTINGS") ||
    current.tenantCtx.roles.some((r) => r === "OWNER" || r === "ADMIN");

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Compras"
        subtitle="Política de solicitudes, cotizaciones, aprobación de OC y avisos cuando hay CxP lista para pagar o se confirma un pago."
      />

      {companies.length > 1 && (
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="companyId">Empresa</Label>
            <select
              id="companyId"
              name="companyId"
              defaultValue={company.id}
              className={selectClassName}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Ver empresa</Button>
        </form>
      )}

      <CompanyProcurementSettingsForm
        companyId={company.id}
        companyName={company.name}
        settings={settings}
        canEdit={canEdit}
      />
    </PageShell>
  );
}
