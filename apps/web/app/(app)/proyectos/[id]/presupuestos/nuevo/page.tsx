import { redirect } from "next/navigation";
import { BudgetForm } from "@/features/budgets";
import { getCurrentUser } from "@/lib/auth";
import { createBudgetAction } from "../actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoPresupuestoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Nuevo presupuesto</h1>
      <div className="rounded-lg border bg-card p-6">
        <BudgetForm
          projectId={projectId}
          onSubmit={createBudgetAction.bind(null, projectId)}
        />
      </div>
    </div>
  );
}
