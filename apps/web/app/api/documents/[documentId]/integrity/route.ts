import { NextResponse } from "next/server";
import { verifyStoredDocument, ServiceError } from "@bloqer/services";
import { isUuid } from "@bloqer/utils";
import { getCurrentUser } from "@/lib/auth";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx || !current.session.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
  const { documentId } = await params;
  if (!isUuid(documentId)) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404, headers });
  try {
    const result = await verifyStoredDocument(documentId, { actorUserId: current.session.user.id, ...current.tenantCtx });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const status = error instanceof ServiceError
      ? error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400
      : 503;
    return NextResponse.json({ error: error instanceof ServiceError ? error.message : "No se pudo leer el archivo guardado. Intentá de nuevo; si persiste, solicitá una revisión." }, { status, headers });
  }
}
