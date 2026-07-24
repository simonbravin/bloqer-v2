import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { CONTABILIDAD_SUBNAV_LINKS } from "@/lib/contabilidad-subnav";

export default async function ContabilidadLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  if (!can(ctx.roles, "VIEW", "ACCOUNTING")) {
    redirect("/dashboard");
  }

  return (
    <SectionSubnavLayout
      subnav={
        <ModuleSubnav
          links={CONTABILIDAD_SUBNAV_LINKS}
          ariaLabel="Navegación de contabilidad"
          sectionLabel="Contabilidad"
        />
      }
    >
      {children}
    </SectionSubnavLayout>
  );
}
