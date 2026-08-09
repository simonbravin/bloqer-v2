import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { TESORERIA_SUBNAV_LINKS } from "@/lib/tesoreria-subnav";
import { canViewCompanyTreasury, getTenantModuleGate } from "@bloqer/services";

export default async function TesoreriaLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  if (!canViewCompanyTreasury(ctx.roles)) {
    redirect("/dashboard");
  }

  const gate = await getTenantModuleGate(ctx);
  const links = TESORERIA_SUBNAV_LINKS.filter((link) => {
    if (link.href !== "/tesoreria/conciliacion") return true;
    return (
      gate.isEnabled("BANK_RECONCILIATION")
      && can(ctx.roles, "VIEW", "BANK_RECONCILIATION")
    );
  });

  return (
    <SectionSubnavLayout
      subnav={
        <ModuleSubnav
          links={links}
          ariaLabel="Navegación de tesorería"
          sectionLabel="Tesorería"
        />
      }
    >
      {children}
    </SectionSubnavLayout>
  );
}
