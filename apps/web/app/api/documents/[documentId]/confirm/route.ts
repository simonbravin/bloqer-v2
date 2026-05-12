import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { confirmDocumentUpload, ServiceError } from "@bloqer/services";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { documentId } = await params;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  try {
    await confirmDocumentUpload(documentId, ctx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
