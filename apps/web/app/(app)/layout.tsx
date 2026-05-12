import { redirect } from "next/navigation";
import type { PermissionModule } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { AppLayout } from "@/components/layout/app-layout";
import { getTenantModuleGate, getUnreadNotificationCount, isPlatformSuperadmin } from "@bloqer/services";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  let notificationUnreadCount = 0;
  if (current.tenantCtx) {
    try {
      notificationUnreadCount = await getUnreadNotificationCount({
        actorUserId: current.session.user.id!,
        tenantId:    current.tenantCtx.tenantId,
        companyId:   current.tenantCtx.companyId,
        roles:       current.tenantCtx.roles,
      });
    } catch {
      /* badge is best-effort; never break the app shell */
    }
  }

  let showPlatformLink = false;
  try {
    showPlatformLink = await isPlatformSuperadmin(current.session.user.id!);
  } catch {
    showPlatformLink = false;
  }

  let tenantModuleIsEnabled: ((m: PermissionModule) => boolean) | undefined;
  if (current.tenantCtx) {
    const ctx = await buildTenantServiceContext();
    if (ctx) {
      try {
        const gate = await getTenantModuleGate(ctx);
        tenantModuleIsEnabled = (m) => gate.isEnabled(m);
      } catch {
        tenantModuleIsEnabled = undefined;
      }
    }
  }

  return (
    <AppLayout
      user={current.session.user}
      tenantCtx={current.tenantCtx}
      notificationUnreadCount={notificationUnreadCount}
      showPlatformLink={showPlatformLink}
      tenantModuleIsEnabled={tenantModuleIsEnabled}
    >
      {children}
    </AppLayout>
  );
}
