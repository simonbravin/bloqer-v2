import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getJobsiteLogById,
  getJobsiteLogFormPickList,
  getProjectShellInfo,
  getWbsIncrementalProgressSnapshot,
  hasLegacyPhysicalPctOverflow,
  listProjectWbsItemsForLog,
  ServiceError,
} from "@bloqer/services";
import { JobsiteLogForm } from "@/features/jobsite-log";
import { getStockBalancePreviewAction, updateJobsiteLogAction } from "../../actions";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { formatDateLong } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string; logId: string }>;
}

export default async function EditarParteObraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, logId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let log;
  try {
    log = await getJobsiteLogById(logId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (log.status !== "DRAFT") redirect(`/proyectos/${projectId}/libro-obra/${logId}`);

  let wbsRaw: Awaited<ReturnType<typeof listProjectWbsItemsForLog>>;
  let pickList: Awaited<ReturnType<typeof getJobsiteLogFormPickList>>;
  let wbsProgressSnapshot: Awaited<ReturnType<typeof getWbsIncrementalProgressSnapshot>>;
  let project;
  try {
    [wbsRaw, pickList, wbsProgressSnapshot, project] = await Promise.all([
      listProjectWbsItemsForLog(projectId, ctx).catch(() => []),
      getJobsiteLogFormPickList(projectId, ctx),
      getWbsIncrementalProgressSnapshot(projectId, ctx, { excludeLogId: logId }),
      getProjectShellInfo(projectId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const companyId = log.companyId || current.tenantCtx.companyId || pickList.companyId || "";

  const updateAction = async (fd: FormData) => {
    "use server";
    return updateJobsiteLogAction(logId, fd);
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Editar parte de obra"
        subtitle={formatDateLong(log.logDate)}
      />
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
        action={updateAction}
        mode="edit"
        submitLabel="Guardar cambios"
        defaultValues={{
          logDate: new Date(log.logDate).toISOString().split("T")[0]!,
          title: log.title ?? "",
          workFront: log.workFront ?? "",
          shift: log.shift ?? "",
          weather: log.weather ?? "",
          generalNotes: log.generalNotes ?? "",
          blockers: log.blockers ?? "",
          incidents: log.incidents ?? "",
          safetyNotes: log.safetyNotes ?? "",
          progress: log.progress.map((p) => ({
            wbsNodeId: p.wbsNodeId,
            description: p.description ?? "",
            quantityCompleted: p.quantityCompleted,
            physicalPct: p.physicalPct ?? "",
            notes: p.notes ?? "",
          })),
          labor: log.labor.map((lb) => ({
            contactId: lb.contactId ?? "__none__",
            subcontractId: lb.subcontractId ?? "__none__",
            crewDescription: lb.crewDescription ?? "",
            workersCount: String(lb.workersCount),
            hoursWorked: lb.hoursWorked ?? "",
            notes: lb.notes ?? "",
          })),
          materials: log.materials.map((m) => ({
            productId: m.productId ?? "__none__",
            warehouseId: m.warehouseId ?? "__none__",
            description: m.description,
            quantity: m.quantity,
            notes: m.notes ?? "",
          })),
          issues: log.issues.map((iss) => ({
            type: iss.type,
            severity: iss.severity,
            description: iss.description,
            status: iss.status,
            notes: iss.notes ?? "",
          })),
        }}
        />
      </div>
    </PageShell>
  );
}
