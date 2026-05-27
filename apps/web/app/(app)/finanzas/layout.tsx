import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { FinanceSubnav, getFinanceSubnavLinks } from "@/features/finance";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { cn } from "@/lib/utils";

export default async function FinanzasLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const links = await getFinanceSubnavLinks(ctx);

  return (
    <div className="min-h-0 border-b border-border/60 bg-gradient-to-b from-muted/30 to-background">
      <div className={cn("shell-page", "space-y-0 pb-2 pt-5")}>
        <FinanceSubnav links={links} />
      </div>
      {children}
    </div>
  );
}
