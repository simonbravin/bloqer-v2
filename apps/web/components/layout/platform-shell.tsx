import type { Session } from "next-auth";
import { SearchParamsToast } from "@/components/feedback/search-params-toast";
import { PlatformNavProvider } from "@/features/platform/platform-nav-context";
import { PlatformHeader } from "./platform-header";
import { PlatformSidebar } from "./platform-sidebar";

export function PlatformShell({
  user,
  children,
}: {
  user: Session["user"];
  children: React.ReactNode;
}) {
  return (
    <PlatformNavProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <PlatformSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PlatformHeader user={user} />
          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-muted/20 p-4 sm:p-6 lg:p-8 dark:bg-muted/10">
            <SearchParamsToast />
            {children}
          </main>
        </div>
      </div>
    </PlatformNavProvider>
  );
}
