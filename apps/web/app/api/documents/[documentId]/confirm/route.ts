import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { documentRevalidatePaths } from "@/features/documents/lib/document-revalidate-paths";
import { confirmDocumentUpload, ServiceError } from "@bloqer/services";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { documentId } = await params;
  if (!UUID_RE.test(documentId)) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    const doc = await confirmDocumentUpload(documentId, ctx);
    for (const path of documentRevalidatePaths({ ...doc, documentId: doc.id })) {
      revalidatePath(path);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) {
      const status =
        err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : err.code === "CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
