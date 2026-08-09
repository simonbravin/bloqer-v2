import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { canViewCompanyFinanceHub, getTenantModuleGate } from "@bloqer/services";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { CONTABILIDAD_SUBNAV_LINKS } from "@/lib/contabilidad-subnav";

export default async function ContabilidadLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  if (!canViewCompanyFinanceHub(ctx.roles) || !can(ctx.roles, "VIEW", "ACCOUNTING")) {
    redirect("/dashboard");
  }

  const gate = await getTenantModuleGate(ctx);
  const links = CONTABILIDAD_SUBNAV_LINKS.filter((link) => {
    if (link.href !== "/contabilidad/cierres") return true;
    return gate.isEnabled("PERIOD_CLOSE") && can(ctx.roles, "VIEW", "PERIOD_CLOSE");
  });

  return (
    <SectionSubnavLayout
      subnav={
        <ModuleSubnav
          links={links}
          ariaLabel="Navegación de contabilidad"
          sectionLabel="Contabilidad"
        />
      }
    >
      {children}
    </SectionSubnavLayout>
  );
}
