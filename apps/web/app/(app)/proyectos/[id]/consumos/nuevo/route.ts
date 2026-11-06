import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getProjectShellInfo, isPlatformSuperadmin, ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";

/** Send the legacy redirect before any page layout starts streaming. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const { session, tenantCtx } = current;
  if (!tenantCtx) redirect(await isPlatformSuperadmin(session.user.id) ? "/login" : "/onboarding");

  const { id } = await params;
  const destination = `/proyectos/${id}/consumos`;
  try {
    await getProjectShellInfo(id, { actorUserId: session.user.id, ...tenantCtx });
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") redirect(destination);
    if (error instanceof ServiceError && error.code === "FORBIDDEN") redirect("/dashboard");
    throw error;
  }

  redirect(can(tenantCtx.roles, "EDIT", "INVENTORY") ? `${destination}?create=1` : destination);
}
