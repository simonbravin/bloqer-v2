import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentDownloadUrl, ServiceError } from "@bloqer/services";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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
    const url = await getDocumentDownloadUrl(documentId, ctx);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 409;
      // Prefer plain text so a browser navigation shows a readable message (not raw JSON).
      return new NextResponse(err.message, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw err;
  }
}
