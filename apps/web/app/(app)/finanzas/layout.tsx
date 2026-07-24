import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { canViewCompanyFinanceHub } from "@bloqer/services";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { FinanceSubnav, getFinanceSubnavLinks } from "@/features/finance";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

export default async function FinanzasLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  if (!canViewCompanyFinanceHub(ctx.roles)) {
    redirect("/dashboard");
  }

  const links = await getFinanceSubnavLinks(ctx);
  if (links.length === 0) {
    redirect("/dashboard");
  }

  return (
    <SectionSubnavLayout subnav={<FinanceSubnav links={links} />}>
      {children}
    </SectionSubnavLayout>
  );
}
