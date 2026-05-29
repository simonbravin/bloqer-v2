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
  /** Phase 12B / 15A: serialized tenant module flags for nav (global sidebar + project workspace). */
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
  children: React.ReactNode;
}

export function AppLayout({
  user,
  tenantCtx,
  notificationUnreadCount = 0,
  showPlatformLink = false,
  moduleGateSnapshot,
  children,
}: AppLayoutProps) {
  const roles = tenantCtx?.roles ?? [];

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppNavColumn
        roles={roles}
        moduleGateSnapshot={moduleGateSnapshot}
        isTenantUser={Boolean(tenantCtx)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          tenantName={tenantCtx?.tenantName}
          notificationUnreadCount={notificationUnreadCount}
          showPlatformLink={showPlatformLink}
        />
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-muted/20 p-4 sm:p-6 lg:p-8 dark:bg-muted/10">
          {children}
        </main>
      </div>
    </div>
  );
}
