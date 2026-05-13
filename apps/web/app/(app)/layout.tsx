import { redirect } from "next/navigation";
import { OVERVIEW_MODULES, type PermissionModule } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { AppLayout } from "@/components/layout/app-layout";
import { getTenantModuleGate, getUnreadNotificationCount, isPlatformSuperadmin } from "@bloqer/services";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  if (!current.tenantCtx) {
    const platform = await isPlatformSuperadmin(current.session.user.id!);
    if (!platform) redirect("/onboarding");
  }

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

  let moduleGateSnapshot: Partial<Record<PermissionModule, boolean>> | undefined;
  if (current.tenantCtx) {
    const ctx = await buildTenantServiceContext();
    if (ctx) {
      try {
        const gate = await getTenantModuleGate(ctx);
        moduleGateSnapshot = Object.fromEntries(
          OVERVIEW_MODULES.map((m) => [m, gate.isEnabled(m)]),
        ) as Record<PermissionModule, boolean>;
      } catch {
        moduleGateSnapshot = {};
      }
    } else {
      moduleGateSnapshot = {};
    }
  }

  return (
    <AppLayout
      user={current.session.user}
      tenantCtx={current.tenantCtx}
      notificationUnreadCount={notificationUnreadCount}
      showPlatformLink={showPlatformLink}
      moduleGateSnapshot={moduleGateSnapshot}
    >
      {children}
    </AppLayout>
  );
}
