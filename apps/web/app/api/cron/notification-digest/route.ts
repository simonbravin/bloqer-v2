import { NextRequest } from "next/server";
import { runNotificationDigestForAllActiveTenants, runNotificationDigestForTenant } from "@bloqer/services";
import { runAuthenticatedCron } from "@/lib/cron-request";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runAuthenticatedCron(req, {
    all: runNotificationDigestForAllActiveTenants,
    tenant: runNotificationDigestForTenant,
  });
}
export const POST = GET;
