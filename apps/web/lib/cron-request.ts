import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOperationalAlertsCronSecret } from "@bloqer/config";

/** Common HTTP contract for existing cron runners. Does not schedule or retry work. */
export async function runAuthenticatedCron(
  req: NextRequest,
  runners: { all: () => Promise<{ ok: boolean }>; tenant: (id: string) => Promise<{ ok: boolean }> },
): Promise<NextResponse> {
  const json = (body: unknown, status: number) => NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
  const expected = getOperationalAlertsCronSecret();
  if (!expected) return json({ ok: false, error: "cron_unconfigured" }, 503);
  const auth = req.headers.get("authorization");
  const provided = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim() : req.headers.get("x-cron-secret")?.trim();
  if (!provided) return json({ ok: false, error: "unauthorized" }, 401);
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ ok: false, error: "unauthorized" }, 401);
  const ids = req.nextUrl.searchParams.getAll("tenantId");
  // An empty/duplicated target must never broaden a targeted request to all tenants.
  if (ids.length > 1 || (ids.length === 1 && !z.string().guid().safeParse(ids[0]).success)) {
    return json({ ok: false, error: "invalid_tenant_id" }, 400);
  }
  try {
    const result = ids.length ? await runners.tenant(ids[0]!) : await runners.all();
    return json(result, result.ok ? 200 : 500);
  } catch {
    console.error("[cron] Runner failed; inspect the service execution logs.");
    return json({ ok: false, error: "cron_failed" }, 500);
  }
}
