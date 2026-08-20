import { redirect } from "next/navigation";
import { OVERVIEW_MODULES, type PermissionModule } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { AppLayout } from "@/components/layout/app-layout";
import {
  getTenantModuleGate,
  getUnreadNotificationCount,
  isPlatformSuperadmin,
  getTenantLogoDisplayMeta,
} from "@bloqer/services";
import { getCachedFieldPendingCounts } from "@/lib/rsc-cached-tenant";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  if (!current.tenantCtx) {
    const platform = await isPlatformSuperadmin(current.session.user.id!);
    if (!platform) redirect("/onboarding");
  }

  let showPlatformLink = false;
  try {
    showPlatformLink = await isPlatformSuperadmin(current.session.user.id!);
  } catch {
    showPlatformLink = false;
  }

  let notificationUnreadCount = 0;
  let pendingCount = 0;
  let moduleGateSnapshot: Partial<Record<PermissionModule, boolean>> | undefined;
  let hasTenantLogo = false;
  let tenantLogoVersion: string | null = null;

  if (current.tenantCtx) {
    const ctx = await buildTenantServiceContext();
    if (ctx) {
      const [unread, pending, gateResult, logoResult] = await Promise.allSettled([
        getUnreadNotificationCount(ctx),
        getCachedFieldPendingCounts(ctx),
        getTenantModuleGate(ctx),
        getTenantLogoDisplayMeta(ctx),
      ]);
      if (unread.status === "fulfilled") notificationUnreadCount = unread.value;
      if (pending.status === "fulfilled") pendingCount = pending.value.total;
      if (gateResult.status === "fulfilled") {
        moduleGateSnapshot = Object.fromEntries(
          OVERVIEW_MODULES.map((m) => [m, gateResult.value.isEnabled(m)]),
        ) as Record<PermissionModule, boolean>;
      } else {
        moduleGateSnapshot = {};
      }
      if (logoResult.status === "fulfilled") {
        hasTenantLogo = logoResult.value.hasLogo;
        tenantLogoVersion = logoResult.value.version;
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
      pendingCount={pendingCount}
      showPlatformLink={showPlatformLink}
      moduleGateSnapshot={moduleGateSnapshot}
      hasTenantLogo={hasTenantLogo}
      tenantLogoVersion={tenantLogoVersion}
    >
      {children}
    </AppLayout>
  );
}
