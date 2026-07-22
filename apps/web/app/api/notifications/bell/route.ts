import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getNotificationBellSnapshot, ServiceError } from "@bloqer/services";

export async function GET(): Promise<NextResponse> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    const snapshot = await getNotificationBellSnapshot(ctx);
    return NextResponse.json(
      {
        unreadCount: snapshot.unreadCount,
        items: snapshot.items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body.length > 160 ? `${n.body.slice(0, 160)}…` : n.body,
          severity: n.severity,
          status: n.status,
          createdAt: n.createdAt,
          actionUrl: n.actionUrl,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 500;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
