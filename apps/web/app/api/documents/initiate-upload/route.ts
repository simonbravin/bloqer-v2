import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { initiateDocumentUpload, ServiceError } from "@bloqer/services";
import { initiateUploadSchema } from "@bloqer/validators";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = initiateUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join(", ") },
      { status: 400 },
    );
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  try {
    const result = await initiateDocumentUpload(parsed.data, ctx);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
