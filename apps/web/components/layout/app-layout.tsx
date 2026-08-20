import type { PermissionModule } from "@bloqer/domain";
import type { Session } from "next-auth";
import type { TenantContext } from "@/lib/tenant";
import { ShellLayout } from "./shell-layout";
import { AppNavColumn } from "./app-nav-column";
import { Header } from "./header";

interface AppLayoutProps {
  user: Session["user"];
  tenantCtx: TenantContext | null;
  notificationUnreadCount?: number;
  pendingCount?: number;
  showPlatformLink?: boolean;
  /** Phase 12B / 15A: serialized tenant module flags for nav (global sidebar + project workspace). */
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
  hasTenantLogo?: boolean;
  tenantLogoVersion?: string | null;
  children: React.ReactNode;
}

export function AppLayout({
  user,
  tenantCtx,
  notificationUnreadCount = 0,
  pendingCount = 0,
  showPlatformLink = false,
  moduleGateSnapshot,
  hasTenantLogo = false,
  tenantLogoVersion = null,
  children,
}: AppLayoutProps) {
  const roles = tenantCtx?.roles ?? [];

  return (
    <ShellLayout
      sidebar={
        <AppNavColumn
          roles={roles}
          moduleGateSnapshot={moduleGateSnapshot}
          isTenantUser={Boolean(tenantCtx)}
          hasTenantLogo={hasTenantLogo}
          tenantLogoVersion={tenantLogoVersion}
        />
      }
      header={
        <Header
          user={user}
          tenantName={tenantCtx?.tenantName}
          notificationUnreadCount={notificationUnreadCount}
          showPlatformLink={showPlatformLink}
        />
      }
      pendingCount={pendingCount}
      roles={roles}
      moduleGateSnapshot={moduleGateSnapshot}
    >
      {children}
    </ShellLayout>
  );
}
