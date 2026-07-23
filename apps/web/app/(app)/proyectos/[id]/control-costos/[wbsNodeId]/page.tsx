import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getWbsItemCostDetail, ServiceError } from "@bloqer/services";
import { WbsItemDrilldown } from "@/features/cost-control";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string; wbsNodeId: string }>;
  searchParams: Promise<{ budgetId?: string; dateFrom?: string; dateTo?: string }>;
}

export default async function WbsItemDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, wbsNodeId } = await params;
  const sp = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const filters = { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo };

  let detail;
  try {
    detail = await getWbsItemCostDetail(wbsNodeId, projectId, filters, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={detail.wbsCode}>
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">{detail.wbsCode}</h1>
          <p className="text-sm text-muted-foreground">{detail.wbsName}</p>
        </div>
      </div>

      <WbsItemDrilldown detail={detail} />
    </PageShell>
  );
}
