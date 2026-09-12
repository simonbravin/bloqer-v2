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
  getTenantNotificationEmailPolicy,
  getTenantProjectAccessMode,
  hasTenantWideProjectAccess,
  isMissingNotificationEmailPrefsSchema,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CompanyProcurementSettingsForm } from "@/features/procurement/components/company-procurement-settings-form";
import { CompanyProcurementNotificationSettingsForm } from "@/features/procurement/components/company-procurement-notification-settings-form";
import { ApprovedBudgetEditsPolicyForm } from "@/features/budgets/components/approved-budget-edits-policy-form";
import { ProjectAccessModeSection } from "@/features/tenant-config/components/project-access-mode-section";
import { TenantNotificationEmailPolicyForm } from "@/features/notifications/components/tenant-notification-email-policy-form";
import { ScrollToHash } from "@/components/navigation/scroll-to-element";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
  const canEditProjectAccess =
    can(current.tenantCtx.roles, "EDIT", "TENANT_SETTINGS") ||
    hasTenantWideProjectAccess(current.tenantCtx.roles);
  const canEditEmailPolicy = current.tenantCtx.roles.some((r) => r === "OWNER" || r === "ADMIN");
  const projectAccessMode = await getTenantProjectAccessMode(ctx.tenantId);

  let emailPolicy: Awaited<ReturnType<typeof getTenantNotificationEmailPolicy>> | null = null;
  let emailPolicyMissingSchema = false;
  let emailPolicyError: string | null = null;
  if (canEditEmailPolicy) {
    try {
      emailPolicy = await getTenantNotificationEmailPolicy(ctx);
    } catch (err) {
      if (isMissingNotificationEmailPrefsSchema(err)) {
        emailPolicyMissingSchema = true;
      } else if (err instanceof ServiceError) {
        emailPolicyError = err.message;
      } else {
        emailPolicyError = "No se pudo cargar la política de email.";
      }
    }
  }

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
    <PageShell variant="default" className="space-y-12">
      <ScrollToHash />
      <PageListHeader
        title="Políticas"
        subtitle="Reglas de acceso a obras, compras, notificaciones de la empresa y excepciones de presupuesto."
      />

      <section id="acceso-obras" className="space-y-5 scroll-mt-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Acceso a proyectos</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Definí si el equipo ve todas las obras o solo las asignadas. Las asignaciones se
            gestionan por usuario en Equipo.
          </p>
        </div>
        <ProjectAccessModeSection
          initialMode={projectAccessMode}
          canEdit={canEditProjectAccess}
        />
      </section>

      <section id="compras" className="space-y-5 scroll-mt-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Compras</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Umbrales de solicitudes, cotizaciones, aprobación de OC y atajos operativos. Las
            alertas de vencimiento y el canal de avisos de pago están en{" "}
            <a href="#notificaciones" className="font-medium text-foreground underline-offset-4 hover:underline">
              Notificaciones
            </a>
            .
          </p>
        </div>

        {companies.length > 1 ? (
          <form
            method="get"
            action="/configuracion/politicas"
            className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 px-4 py-3"
          >
            <div className="space-y-1.5">
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
            <Button type="submit" variant="secondary">
              Ver empresa
            </Button>
          </form>
        ) : null}

        <CompanyProcurementSettingsForm
          key={`compras-${company.id}`}
          companyId={company.id}
          companyName={company.name}
          settings={settings}
          canEdit={canEditCompras}
        />
      </section>

      <section id="notificaciones" className="space-y-5 scroll-mt-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Notificaciones</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Políticas de la empresa: qué alertas se generan y el canal CxP. Cada usuario elige qué
            correos quiere recibir en{" "}
            <Link
              href="/configuracion/notificaciones"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Configuración → Notificaciones
            </Link>
            . La campana in-app no se apaga desde ahí.
          </p>
        </div>

        {companies.length > 1 ? (
          <form
            method="get"
            action="/configuracion/politicas"
            className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 px-4 py-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="companyIdNotif">Empresa</Label>
              <select
                id="companyIdNotif"
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
            <Button type="submit" variant="secondary">
              Ver empresa
            </Button>
          </form>
        ) : null}

        <CompanyProcurementNotificationSettingsForm
          key={`notif-${company.id}`}
          companyId={company.id}
          companyName={company.name}
          settings={settings}
          canEdit={canEditCompras}
        />

        {canEditEmailPolicy ? (
          <div id="email-direccion" className="space-y-5 scroll-mt-6">
            <div className="space-y-1">
              <h3 className="text-base font-semibold tracking-tight">Email a dirección</h3>
              <p className="text-sm text-muted-foreground max-w-3xl">
                CC del flujo diario y digest matutino para Propietario / Administrador.
              </p>
            </div>
            {emailPolicyMissingSchema ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <p className="font-medium">Falta aplicar la migración de base de datos (D-114)</p>
                <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
                  Esta sección necesita las tablas de preferencias de email. Corré{" "}
                  <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                    pnpm db:migrate:deploy
                  </code>{" "}
                  contra la base de este entorno y volvé a cargar.
                </p>
              </div>
            ) : emailPolicyError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                {emailPolicyError}
              </div>
            ) : emailPolicy ? (
              <TenantNotificationEmailPolicyForm
                leadershipDailyFlowEmailCc={emailPolicy.leadershipDailyFlowEmailCc}
                digestEnabledDefault={emailPolicy.digestEnabledDefault}
                digestHourLocal={emailPolicy.digestHourLocal}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <section id="presupuestos" className="space-y-5 scroll-mt-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Presupuestos</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Política excepcional para editar presupuestos ya aprobados: partidas, APU, costos y
            venta (deshabilitada por defecto). Se listan todas las obras: si no hay presupuesto
            aprobado, se indica; si hay, podés habilitar la edición.
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
