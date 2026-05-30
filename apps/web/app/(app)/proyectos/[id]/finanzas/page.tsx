import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ProjectFinanceDashboardView } from "@/features/projects";
import { getProjectFinanceDashboard, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ months?: string; budgetId?: string }>;
}

export default async function ProyectoFinanzasPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let dashboard;
  try {
    dashboard = await getProjectFinanceDashboard(ctx, id, {
      months: sp.months === "6" ? 6 : 12,
      budgetId: sp.budgetId,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <Suspense fallback={null}>
        <ProjectFinanceDashboardView dashboard={dashboard} />
      </Suspense>
    </PageShell>
  );
}
