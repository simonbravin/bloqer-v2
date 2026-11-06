import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { can } from "@bloqer/domain";
import { getProjectShellInfo, isPlatformSuperadmin, ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";

/** Send the legacy redirect before any page layout starts streaming. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const { session, tenantCtx } = current;
  if (!tenantCtx) redirect(await isPlatformSuperadmin(session.user.id) ? "/login" : "/onboarding");

  const { id } = await params;
  const destination = `/proyectos/${id}/facturas-proveedor`;
  try {
    await getProjectShellInfo(id, { actorUserId: session.user.id, ...tenantCtx });
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") redirect(destination);
    if (error instanceof ServiceError && error.code === "FORBIDDEN") redirect("/dashboard");
    throw error;
  }

  if (!can(tenantCtx.roles, "EDIT", "AP")) redirect(destination);

  const next = new URLSearchParams({ create: "1" });
  for (const key of ["error", "wbsNodeId", "description", "quantity", "costAnalysisLineId", "unit", "costType", "from"]) {
    const value = request.nextUrl.searchParams.getAll(key).join(",");
    if (value) next.set(key, value);
  }
  redirect(`${destination}?${next.toString()}`);
}
