import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ProjectFinanceOverviewView } from "@/features/projects";
import { getProjectFinanceOverview, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProyectoFinanzasPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let overview;
  try {
    overview = await getProjectFinanceOverview(ctx, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectFinanceOverviewView overview={overview} />
    </PageShell>
  );
}
