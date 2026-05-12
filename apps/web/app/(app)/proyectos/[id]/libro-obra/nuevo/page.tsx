import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getJobsiteLogFormPickList, listProjectWbsItemsForLog, ServiceError } from "@bloqer/services";
import { JobsiteLogForm } from "@/features/jobsite-log";
import { createJobsiteLogAction } from "../actions";

interface PageProps { params: Promise<{ id: string }> }

export default async function NuevoParteObraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let wbsRaw: Awaited<ReturnType<typeof listProjectWbsItemsForLog>>;
  let pickList: Awaited<ReturnType<typeof getJobsiteLogFormPickList>>;
  try {
    [wbsRaw, pickList] = await Promise.all([
      listProjectWbsItemsForLog(projectId, ctx).catch(() => []),
      getJobsiteLogFormPickList(projectId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const companyId = pickList.companyId || current.tenantCtx.companyId || "";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/libro-obra`}>← Libro de obra</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo parte de obra</h1>
      </div>
      <JobsiteLogForm
        projectId={projectId}
        companyId={companyId}
        wbsOptions={wbsRaw.map((n) => ({ id: n.id, code: n.code, name: n.name, unit: n.costItem?.unit ?? "" }))}
        contactOptions={pickList.contactOptions}
        productOptions={pickList.productOptions}
        warehouseOptions={pickList.warehouseOptions}
        subcontractOptions={pickList.subcontractOptions.map((s) => ({
          id: s.id,
          code: `SC-${String(s.number).padStart(3, "0")}`,
          title: s.title,
        }))}
        action={createJobsiteLogAction}
      />
    </div>
  );
}
