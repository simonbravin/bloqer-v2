import type { PermissionModule } from "@bloqer/domain";
import type { Session } from "next-auth";
import type { TenantContext } from "@/lib/tenant";
import { AppNavColumn } from "./app-nav-column";
import { Header } from "./header";

interface AppLayoutProps {
  user: Session["user"];
  tenantCtx: TenantContext | null;
  notificationUnreadCount?: number;
  showPlatformLink?: boolean;
  /** Phase 12B */
  tenantModuleIsEnabled?: (module: PermissionModule) => boolean;
  /** Phase 15A: serialized tenant module flags for project workspace nav (omit when no tenant). */
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
  children: React.ReactNode;
}

export function AppLayout({
  user,
  tenantCtx,
  notificationUnreadCount = 0,
  showPlatformLink = false,
  tenantModuleIsEnabled,
  moduleGateSnapshot,
  children,
}: AppLayoutProps) {
  const roles = tenantCtx?.roles ?? [];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppNavColumn
        tenantName={tenantCtx?.tenantName}
        roles={roles}
        tenantModuleIsEnabled={tenantModuleIsEnabled}
        moduleGateSnapshot={moduleGateSnapshot}
        isTenantUser={Boolean(tenantCtx)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} notificationUnreadCount={notificationUnreadCount} showPlatformLink={showPlatformLink} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
