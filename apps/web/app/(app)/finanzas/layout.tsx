import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { FinanceSubnav, getFinanceSubnavLinks } from "@/features/finance";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

export default async function FinanzasLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const links = await getFinanceSubnavLinks(ctx);

  return (
    <div className="min-h-0 border-b border-border/60 bg-gradient-to-b from-muted/30 to-background">
      <div className="mx-auto w-full max-w-6xl px-4 pb-2 pt-5 sm:px-6 lg:px-8">
        <FinanceSubnav links={links} />
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
