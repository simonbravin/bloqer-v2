import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { TESORERIA_SUBNAV_LINKS } from "@/lib/tesoreria-subnav";
import { canViewCompanyTreasury } from "@bloqer/services";

export default async function TesoreriaLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  if (!canViewCompanyTreasury(ctx.roles)) {
    redirect("/dashboard");
  }

  return (
    <SectionSubnavLayout
      subnav={
        <ModuleSubnav
          links={TESORERIA_SUBNAV_LINKS}
          ariaLabel="Navegación de tesorería"
          sectionLabel="Tesorería"
        />
      }
    >
      {children}
    </SectionSubnavLayout>
  );
}
