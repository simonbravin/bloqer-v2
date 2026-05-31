import type { ServiceContext } from "@bloqer/services";
import {
  getScheduledReportCatalog,
  getScheduledReportFormTenantTimezone,
  listProjectsForScheduledReportPicker,
  listTenantMembersForScheduledReports,
} from "@bloqer/services";
import type {
  ScheduledReportCatalogOption,
  ScheduledReportFormMember,
  ScheduledReportFormProject,
} from "@/features/scheduled-reports/scheduled-report-form";

export type ScheduledReportFormData = {
  defaultTimezone: string;
  tenantCatalog: ScheduledReportCatalogOption[];
  projectCatalog: ScheduledReportCatalogOption[];
  members: ScheduledReportFormMember[];
  projects: ScheduledReportFormProject[];
};

export async function loadScheduledReportFormData(
  ctx: ServiceContext,
): Promise<ScheduledReportFormData> {
  const [defaultTimezone, tenantCatalog, projectCatalog, members, projects] = await Promise.all([
    getScheduledReportFormTenantTimezone(ctx),
    getScheduledReportCatalog(ctx, "TENANT"),
    getScheduledReportCatalog(ctx, "PROJECT"),
    listTenantMembersForScheduledReports(ctx),
    listProjectsForScheduledReportPicker(ctx),
  ]);

  return {
    defaultTimezone,
    tenantCatalog,
    projectCatalog,
    members: members
      .filter((m) => m.status === "ACTIVE")
      .map((m) => ({
        userId: m.userId,
        email: m.email,
        name: m.name,
      })),
    projects,
  };
}
