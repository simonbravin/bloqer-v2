import { notFound, redirect } from "next/navigation";
import {
  canManageApprovedBudgetEditPolicy,
  canReadTenantConfigArea,
  getApprovedBudgetEditsPolicy,
  ServiceError,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { ApprovedBudgetEditsPolicyForm } from "@/features/budgets/components/approved-budget-edits-policy-form";

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

export default async function ConfiguracionPresupuestosPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  let policy;
  try {
    policy = await getApprovedBudgetEditsPolicy(ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    if (isMissingApprovedBudgetEditsSchema(err)) {
      return (
        <PageShell variant="default" className="space-y-6">
          <PageListHeader
            title="Presupuestos"
            subtitle="Política excepcional para editar presupuestos ya aprobados."
          />
          <div
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <p className="font-medium">Falta aplicar la migración de base de datos (D-088)</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
              Esta pantalla necesita las columnas de edición excepcional en Tenant y Project. Corré{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">pnpm db:migrate:deploy</code>{" "}
              contra la base de este entorno y volvé a cargar.
            </p>
          </div>
        </PageShell>
      );
    }
    throw err;
  }

  const canEdit = canManageApprovedBudgetEditPolicy(current.tenantCtx.roles);

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Presupuestos"
        subtitle="Política excepcional para editar presupuestos ya aprobados (deshabilitada por defecto). Se listan todas las obras: si no hay presupuesto aprobado, se indica; si hay, podés habilitar la edición."
      />
      <ApprovedBudgetEditsPolicyForm policy={policy} canEdit={canEdit} />
    </PageShell>
  );
}
