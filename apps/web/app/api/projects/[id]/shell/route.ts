import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, ServiceError } from "@bloqer/services";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    const shell = await getProjectShellInfo(id, ctx);
    return NextResponse.json(shell);
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 500;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
