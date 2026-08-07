import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTenantLogoBytes, ServiceError } from "@bloqer/services";

/**
 * Streams the current session tenant's brand logo ([D-071]).
 * Isolation: bytes are resolved only via `session.tenantId` — never from query params.
 * `?v=` is only a client cache-buster; it does not select which object is returned.
 */
export async function GET(): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return new NextResponse("No autenticado", { status: 401 });
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    const logo = await getTenantLogoBytes(ctx);
    if (!logo) {
      return new NextResponse("Sin logo", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return new NextResponse(new Uint8Array(logo.body), {
      status: 200,
      headers: {
        "Content-Type": logo.mimeType,
        // Avoid stale logos after replace in production browsers/CDNs.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 409;
      return new NextResponse(err.message, {
        status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    throw err;
  }
}
