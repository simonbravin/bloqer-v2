import { NextRequest, NextResponse } from "next/server";
import type { ServiceContext } from "@bloqer/services";
import { ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";

export function searchParamsRecord(req: NextRequest): Record<string, string> {
  const o: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}

export async function requireReportExportContext(): Promise<
  | { ok: true; ctx: ServiceContext }
  | { ok: false; response: NextResponse }
> {
  const u = await getCurrentUser();
  if (!u?.tenantCtx || !u.session.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return {
    ok: true,
    ctx: {
      actorUserId: u.session.user.id,
      tenantId: u.tenantCtx.tenantId,
      companyId: u.tenantCtx.companyId,
      roles: u.tenantCtx.roles,
    },
  };
}

export function reportExportErrorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceError) {
    const status =
      e.code === "FORBIDDEN"
        ? 403
        : e.code === "NOT_FOUND"
          ? 404
          : e.code === "CONFLICT"
            ? 409
            : e.code === "UNAUTHORIZED"
              ? 401
              : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
  console.error("[report-export]", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "export_failed" }, { status: 500 });
}

export function csvResponse(content: string, filename: string): NextResponse {
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function pdfResponse(buffer: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
