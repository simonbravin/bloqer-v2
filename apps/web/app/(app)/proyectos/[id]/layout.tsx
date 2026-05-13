import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, getTenantModuleGate, ServiceError } from "@bloqer/services";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ProjectScopedLayout({ children, params }: LayoutProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await Promise.all([getProjectShellInfo(id, ctx), getTenantModuleGate(ctx)]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  return <>{children}</>;
}
