import Link from "next/link";
import type { Session } from "next-auth";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { SearchParamsToast } from "@/components/feedback/search-params-toast";
import { PlatformMainSubnav } from "@/features/platform/platform-main-subnav";
import { Button } from "@/components/ui/button";

export function PlatformShell({
  user,
  children,
}: {
  user: Session["user"];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-4 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/platform"
            className="inline-flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BloqerLogo className="h-7 max-w-[7.5rem]" />
          </Link>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/dashboard">Ir a la app</Link>
          </Button>
          <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground sm:inline">
            {user.email}
          </span>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 dark:bg-muted/10">
        <SearchParamsToast />
        <div className="shell-page space-y-0 pb-2 pt-1">
          <PlatformMainSubnav />
        </div>
        {children}
      </main>
    </div>
  );
}
