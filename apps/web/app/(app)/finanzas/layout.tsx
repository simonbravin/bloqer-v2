import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { FinanceSubnav, getFinanceSubnavLinks } from "@/features/finance";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

export default async function FinanzasLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const links = await getFinanceSubnavLinks(ctx);

  return (
    <SectionSubnavLayout subnav={<FinanceSubnav links={links} />}>
      {children}
    </SectionSubnavLayout>
  );
}
