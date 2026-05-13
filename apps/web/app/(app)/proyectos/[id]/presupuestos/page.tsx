import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BudgetList } from "@/features/budgets";
import { getCurrentUser } from "@/lib/auth";
import { listBudgetsByProject, getProjectShellInfo, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PresupuestosPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const budgets = await listBudgetsByProject(id, ctx);

  const serialized = budgets.map((b) => ({
    id: b.id,
    projectId: b.projectId,
    versionNumber: b.versionNumber,
    name: b.name,
    status: b.status,
    currency: b.currency,
    totalCost: b.totalCost.toString(),
    totalSalePrice: b.totalSalePrice.toString(),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}`}>← {project.name}</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Presupuestos</h1>
        </div>
        <Button asChild>
          <Link href={`/proyectos/${id}/presupuestos/nuevo`}>Nuevo presupuesto</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Versiones ({serialized.length})</h2>
        </div>
        <div className="px-6 py-4">
          <BudgetList budgets={serialized} projectId={id} />
        </div>
      </div>
    </div>
  );
}
