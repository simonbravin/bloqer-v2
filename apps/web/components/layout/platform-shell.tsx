import type { Session } from "next-auth";
import { SearchParamsToast } from "@/components/feedback/search-params-toast";
import { PlatformNavProvider } from "@/features/platform/platform-nav-context";
import { ShellLayout } from "./shell-layout";
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
      <ShellLayout sidebar={<PlatformSidebar />} header={<PlatformHeader user={user} />}>
        <SearchParamsToast />
        {children}
      </ShellLayout>
    </PlatformNavProvider>
  );
}
