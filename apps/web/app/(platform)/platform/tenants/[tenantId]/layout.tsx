import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { getPlatformTenantById, ServiceError } from "@bloqer/services";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { PlatformTenantSubnav } from "@/features/platform";
import { getPlatformServiceContext } from "@/lib/platform-service-context";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ tenantId: string }>;
}

export default async function PlatformTenantLayout({ children, params }: LayoutProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const ctx = await getPlatformServiceContext(session.user.id);

  try {
    await getPlatformTenantById(tenantId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  return (
    <SectionSubnavLayout subnav={<PlatformTenantSubnav tenantId={tenantId} />}>
      {children}
    </SectionSubnavLayout>
  );
}
