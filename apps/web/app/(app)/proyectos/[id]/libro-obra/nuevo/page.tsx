import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getJobsiteLogFormPickList,
  getProjectShellInfo,
  getWbsIncrementalProgressSnapshot,
  hasLegacyPhysicalPctOverflow,
  listProjectWbsItemsForLog,
  ServiceError,
} from "@bloqer/services";
import { JobsiteLogForm } from "@/features/jobsite-log";
import { createJobsiteLogAction, getStockBalancePreviewAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoParteObraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let wbsRaw: Awaited<ReturnType<typeof listProjectWbsItemsForLog>>;
  let pickList: Awaited<ReturnType<typeof getJobsiteLogFormPickList>>;
  let wbsProgressSnapshot: Awaited<ReturnType<typeof getWbsIncrementalProgressSnapshot>>;
  let project;
  try {
    [wbsRaw, pickList, wbsProgressSnapshot, project] = await Promise.all([
      listProjectWbsItemsForLog(projectId, ctx).catch(() => []),
      getJobsiteLogFormPickList(projectId, ctx),
      getWbsIncrementalProgressSnapshot(projectId, ctx),
      getProjectShellInfo(projectId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const companyId = pickList.companyId || current.tenantCtx.companyId || "";

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader title="Nuevo parte de obra" />
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <JobsiteLogForm
          projectId={projectId}
          companyId={companyId}
          wbsOptions={wbsRaw.map((n) => ({
            id: n.id,
            code: n.code,
            name: n.name,
            unit: n.costItem?.unit ?? "",
          }))}
          contactOptions={pickList.contactOptions}
          productOptions={pickList.productOptions}
          warehouseOptions={pickList.warehouseOptions}
          subcontractOptions={pickList.subcontractOptions.map((s) => ({
            id: s.id,
            code: `SC-${String(s.number).padStart(3, "0")}`,
            title: s.title,
          }))}
          wbsProgressSnapshot={wbsProgressSnapshot}
          legacyPhysicalPctWarning={hasLegacyPhysicalPctOverflow(wbsProgressSnapshot)}
          inventoryModuleEnabled={pickList.inventoryModuleEnabled}
          stockPreviewAction={getStockBalancePreviewAction}
          action={createJobsiteLogAction}
        />
      </div>
    </PageShell>
  );
}
