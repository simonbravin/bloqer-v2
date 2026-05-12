import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOperationalAlertsCronSecret } from "@bloqer/config";
import {
  runOperationalAlertsForAllActiveTenants,
  runOperationalAlertsForTenant,
} from "@bloqer/services";

export const runtime = "nodejs";

function extractCronSecret(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  // If Authorization is absent or not Bearer, allow x-cron-secret (documented alternate).
  const header = req.headers.get("x-cron-secret")?.trim();
  return header && header.length > 0 ? header : null;
}

function secureCompareSecrets(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function handleOperationalAlertsCron(req: NextRequest): Promise<NextResponse> {
  const expected = getOperationalAlertsCronSecret();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "cron_unconfigured" }, { status: 503 });
  }

  const provided = extractCronSecret(req);
  if (!provided || !secureCompareSecrets(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tenantIdRaw = req.nextUrl.searchParams.get("tenantId");
  if (tenantIdRaw !== null && tenantIdRaw !== "") {
    const parsed = z.string().uuid().safeParse(tenantIdRaw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_tenant_id" }, { status: 400 });
    }
    const result = await runOperationalAlertsForTenant(parsed.data);
    return NextResponse.json(result);
  }

  const result = await runOperationalAlertsForAllActiveTenants();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleOperationalAlertsCron(req);
}

/** Vercel Cron invokes GET by default. Same auth and behavior as POST. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleOperationalAlertsCron(req);
}
