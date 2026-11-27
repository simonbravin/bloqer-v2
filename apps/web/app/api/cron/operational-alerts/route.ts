import { NextRequest } from "next/server";
import { runOperationalAlertsForAllActiveTenants, runOperationalAlertsForTenant } from "@bloqer/services";
import { runAuthenticatedCron } from "@/lib/cron-request";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runAuthenticatedCron(req, {
    all: runOperationalAlertsForAllActiveTenants,
    tenant: runOperationalAlertsForTenant,
  });
}
export const POST = GET;
