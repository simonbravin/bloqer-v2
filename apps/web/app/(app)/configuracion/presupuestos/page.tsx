import { notFound, redirect } from "next/navigation";
import {
  canManageApprovedBudgetEditPolicy,
  canReadTenantConfigArea,
  getApprovedBudgetEditsPolicy,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { ApprovedBudgetEditsPolicyForm } from "@/features/budgets/components/approved-budget-edits-policy-form";

export default async function ConfiguracionPresupuestosPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const policy = await getApprovedBudgetEditsPolicy(ctx);
  const canEdit = canManageApprovedBudgetEditPolicy(current.tenantCtx.roles);

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Presupuestos"
        subtitle="Política excepcional para editar presupuestos ya aprobados (por defecto deshabilitada). Los cambios quedan en el registro de auditoría."
      />
      <ApprovedBudgetEditsPolicyForm policy={policy} canEdit={canEdit} />
    </PageShell>
  );
}
