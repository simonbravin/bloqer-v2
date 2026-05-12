import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getWbsItemCostDetail, ServiceError } from "@bloqer/services";
import { WbsItemDrilldown } from "@/features/cost-control";

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
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const filters = { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo };

  let detail;
  try {
    detail = await getWbsItemCostDetail(wbsNodeId, projectId, filters, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const backUrl = `/proyectos/${projectId}/control-costos${sp.budgetId ? `?budgetId=${sp.budgetId}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={backUrl}>← Control de costos</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">{detail.wbsCode}</h1>
          <p className="text-sm text-muted-foreground">{detail.wbsName}</p>
        </div>
      </div>

      <WbsItemDrilldown detail={detail} />
    </div>
  );
}
