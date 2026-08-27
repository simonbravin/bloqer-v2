import { NextResponse } from "next/server";
import { assertPreferredProjectAccess, getMyFieldPendingCounts, ServiceError } from "@bloqer/services";
import { isUuid } from "@bloqer/utils";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

function statusForServiceError(code: ServiceError["code"]): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "VALIDATION":
      return 400;
    default:
      return 500;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await buildTenantServiceContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (projectId && !isUuid(projectId)) {
    return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  }

  try {
    if (projectId) {
      await assertPreferredProjectAccess(projectId, ctx);
    }
    const counts = await getMyFieldPendingCounts(ctx, projectId ? { projectId } : undefined);
    const total = Number.isFinite(counts.total) ? Math.max(0, Math.trunc(counts.total)) : 0;
    return NextResponse.json(
      { total },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message }, { status: statusForServiceError(err.code) });
    }
    throw err;
  }
}
