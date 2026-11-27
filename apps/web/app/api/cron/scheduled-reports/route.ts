import { NextRequest } from "next/server";
import { runScheduledReportsForAllActiveTenants, runScheduledReportsForTenant } from "@bloqer/services";
import { buildScheduledReportAttachment } from "@/lib/scheduled-report-attachment-bridge";
import { runAuthenticatedCron } from "@/lib/cron-request";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runAuthenticatedCron(req, {
    all: () => runScheduledReportsForAllActiveTenants(buildScheduledReportAttachment),
    tenant: (id) => runScheduledReportsForTenant(id, buildScheduledReportAttachment),
  });
}
export const POST = GET;
