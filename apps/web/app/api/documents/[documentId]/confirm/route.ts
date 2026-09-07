import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { confirmDocumentUpload, ServiceError } from "@bloqer/services";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

function parseRevalidatePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter(
        (p): p is string =>
          typeof p === "string" &&
          p.startsWith("/") &&
          !p.startsWith("//") &&
          !p.includes("?") &&
          !p.includes("#") &&
          !p.includes("\\"),
      ),
    ),
  ];
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { documentId } = await params;

  let revalidatePaths: string[] = [];
  try {
    const body = (await req.json()) as { revalidatePaths?: unknown };
    revalidatePaths = parseRevalidatePaths(body.revalidatePaths);
  } catch {
    /* empty body is fine */
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await confirmDocumentUpload(documentId, ctx);
    for (const path of revalidatePaths) {
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
