import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { loadScheduledReportFormData } from "@/lib/scheduled-report-form-data";
import { canManageScheduledReports } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ScheduledReportForm } from "@/features/scheduled-reports/scheduled-report-form";

type Props = {
  searchParams: Promise<{ err?: string; scope?: string; projectId?: string }>;
};

export default async function NuevoReporteProgramadoPage({ searchParams }: Props) {
  const sp = await searchParams;
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  if (!canManageScheduledReports(ctx)) notFound();

  const formData = await loadScheduledReportFormData(ctx);
  const lockScope = sp.scope === "PROJECT" ? "PROJECT" : undefined;
  const lockProjectId = sp.projectId;

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo envío programado</h1>
        {sp.err ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {decodeURIComponent(sp.err)}
          </p>
        ) : null}
      </div>
      <ScheduledReportForm
        mode="create"
        defaultTimezone={formData.defaultTimezone}
        tenantCatalog={formData.tenantCatalog}
        projectCatalog={formData.projectCatalog}
        members={formData.members}
        projects={formData.projects}
        lockScope={lockScope}
        lockProjectId={lockProjectId}
      />
    </PageShell>
  );
}
