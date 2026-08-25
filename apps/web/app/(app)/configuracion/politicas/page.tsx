import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canManageApprovedBudgetEditPolicy,
  canReadTenantConfigArea,
  getApprovedBudgetEditsPolicy,
  getCompanies,
  getCompanyProcurementSettings,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CompanyProcurementSettingsForm } from "@/features/procurement/components/company-procurement-settings-form";
import { ApprovedBudgetEditsPolicyForm } from "@/features/budgets/components/approved-budget-edits-policy-form";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<{ companyId?: string }>;
}

const selectClassName = cn(
  "flex h-10 min-w-[240px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

function isMissingApprovedBudgetEditsSchema(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const message = err instanceof Error ? err.message : String(err);
  return (
    code === "P2022" ||
    /allowApprovedBudgetEconomicEdits/i.test(message) ||
    /column .* does not exist/i.test(message)
  );
}

export default async function ConfiguracionPoliticasPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const companies = await getCompanies(ctx);
  if (companies.length === 0) notFound();

  const companyId = sp.companyId ?? ctx.companyId ?? companies[0]!.id;
  const company = companies.find((c) => c.id === companyId) ?? companies[0]!;
  const settings = await getCompanyProcurementSettings(company.id, ctx);

  const canEditCompras =
    can(current.tenantCtx.roles, "EDIT", "TENANT_SETTINGS") ||
    current.tenantCtx.roles.some((r) => r === "OWNER" || r === "ADMIN");
  const canEditPresupuestos = canManageApprovedBudgetEditPolicy(current.tenantCtx.roles);

  let budgetPolicy: Awaited<ReturnType<typeof getApprovedBudgetEditsPolicy>> | null = null;
  let budgetPolicyMissingSchema = false;
  let budgetPolicyError: string | null = null;
  try {
    budgetPolicy = await getApprovedBudgetEditsPolicy(ctx);
  } catch (err) {
    if (isMissingApprovedBudgetEditsSchema(err)) {
      budgetPolicyMissingSchema = true;
    } else if (err instanceof ServiceError) {
      // Keep compras usable if the budget-policy section cannot load.
      budgetPolicyError = err.message;
    } else {
      throw err;
    }
  }

  return (
    <PageShell variant="default" className="space-y-10">
      <PageListHeader
        title="Políticas"
        subtitle="Políticas de compras y de presupuesto de la organización."
      />

      <section id="compras" className="space-y-6 scroll-mt-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Compras</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Umbrales de solicitudes, cotizaciones, aprobación de OC y avisos cuando hay CxP lista
            para pagar o se confirma un pago.
          </p>
        </div>

        {companies.length > 1 && (
          <form method="get" action="/configuracion/politicas" className="flex flex-wrap items-end gap-3">
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
          canEdit={canEditCompras}
        />
      </section>

      <section id="presupuestos" className="space-y-6 scroll-mt-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Presupuestos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Política excepcional para editar presupuestos ya aprobados (deshabilitada por defecto).
            Se listan todas las obras: si no hay presupuesto aprobado, se indica; si hay, podés
            habilitar la edición.
          </p>
        </div>

        {budgetPolicyMissingSchema ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <p className="font-medium">Falta aplicar la migración de base de datos (D-088)</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
              Esta sección necesita las columnas de edición excepcional en Tenant y Project. Corré{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">pnpm db:migrate:deploy</code>{" "}
              contra la base de este entorno y volvé a cargar.
            </p>
          </div>
        ) : budgetPolicyError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {budgetPolicyError}
          </div>
        ) : budgetPolicy ? (
          <ApprovedBudgetEditsPolicyForm policy={budgetPolicy} canEdit={canEditPresupuestos} />
        ) : null}
      </section>
    </PageShell>
  );
}
