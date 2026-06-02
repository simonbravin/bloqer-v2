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
import { CompanyProcurementSettingsForm } from "@/features/procurement/components/company-procurement-settings-form";

interface PageProps {
  searchParams: Promise<{ companyId?: string }>;
}

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
        <p className="text-sm text-muted-foreground">
          Política de solicitudes, cotizaciones y aprobación de órdenes de compra por empresa.
        </p>
      </div>

      {companies.length > 1 && (
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="companyId" className="text-sm font-medium">
              Empresa
            </label>
            <select
              id="companyId"
              name="companyId"
              defaultValue={company.id}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[240px]"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Ver empresa
          </button>
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
