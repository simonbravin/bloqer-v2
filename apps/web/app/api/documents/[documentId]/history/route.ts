import { NextRequest, NextResponse } from "next/server";
import { getDocumentHistory, ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(req: NextRequest, { params }: {
  params: Promise<{ documentId: string }>;
}): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
  const { documentId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!, tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId, roles: current.tenantCtx.roles,
  };
  try {
    const page = await getDocumentHistory(documentId, ctx, req.nextUrl.searchParams.get("cursor") ?? undefined);
    return NextResponse.json(page, { headers });
  } catch (error) {
    if (error instanceof ServiceError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status, headers });
    }
    throw error;
  }
}
