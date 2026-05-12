import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BudgetStatusBadge, BudgetSettingsForm } from "@/features/budgets";
import { getCurrentUser } from "@/lib/auth";
import { getBudgetById, ServiceError } from "@bloqer/services";
import { updateBudgetSettingsAction } from "../../actions";

interface PageProps {
  params: Promise<{ id: string; budgetId: string }>;
}

export default async function EditarPresupuestoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, budgetId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let budget;
  try {
    budget = await getBudgetById(budgetId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const editable = budget.status === "DRAFT" || budget.status === "RETURNED_FOR_CHANGES";
  const s = budget.settings;

  const defaults = {
    overheadPct: s ? parseFloat(s.overheadPct.toString()) : 0,
    financialCostPct: s ? parseFloat(s.financialCostPct.toString()) : 0,
    financialDaysAvg: s ? s.financialDaysAvg : 0,
    profitPct: s ? parseFloat(s.profitPct.toString()) : 0,
    taxPct: s ? parseFloat(s.taxPct.toString()) : 0,
    notes: s?.notes ?? null,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/presupuestos/${budgetId}`}>← Volver</Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Configuración del presupuesto</h1>
            <BudgetStatusBadge status={budget.status} />
          </div>
          <p className="text-sm text-muted-foreground">{budget.name} — v{budget.versionNumber}</p>
        </div>
      </div>

      {!editable && (
        <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          Este presupuesto está en estado <strong>{budget.status}</strong> y no permite cambios en la configuración.
        </div>
      )}

      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">Parámetros económicos</h2>
        <BudgetSettingsForm
          defaults={defaults}
          onSubmit={(data) => updateBudgetSettingsAction(budgetId, data)}
        />
      </div>
    </div>
  );
}
