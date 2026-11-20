import { NextResponse } from "next/server";
import { exportDocumentHistory, ServiceError } from "@bloqer/services";
import { isUuid } from "@bloqer/utils";
import { getCurrentUser } from "@/lib/auth";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };

export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx || !current.session.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
  const { documentId } = await params;
  if (!isUuid(documentId)) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404, headers });
  try {
    const csv = await exportDocumentHistory(documentId, {
      actorUserId: current.session.user.id, ...current.tenantCtx,
    });
    return new NextResponse(csv, { headers: {
      ...headers, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="historial-${documentId}.csv"`,
    } });
  } catch (error) {
    const status = error instanceof ServiceError
      ? error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400
      : 503;
    return NextResponse.json({ error: error instanceof ServiceError ? error.message : "No se pudo exportar el historial. Intentá de nuevo." }, { status, headers });
  }
}
