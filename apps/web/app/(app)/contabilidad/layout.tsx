import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { canViewCompanyFinanceHub, getTenantModuleGate } from "@bloqer/services";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { loadAccountingPageContext } from "@/lib/accounting-page-company";
import { CONTABILIDAD_SUBNAV_LINKS } from "@/lib/contabilidad-subnav";
import { AccountingModuleNav } from "@/features/accounting/components/accounting-module-nav";

export default async function ContabilidadLayout({ children }: { children: ReactNode }) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  if (!canViewCompanyFinanceHub(ctx.roles) || !can(ctx.roles, "VIEW", "ACCOUNTING")) {
    redirect("/dashboard");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("ACCOUNTING")) redirect("/dashboard");

  const { companies } = await loadAccountingPageContext();
  const links = CONTABILIDAD_SUBNAV_LINKS.filter((link) => {
    if (link.href !== "/contabilidad/cierres") return true;
    return gate.isEnabled("PERIOD_CLOSE") && can(ctx.roles, "VIEW", "PERIOD_CLOSE");
  });

  return (
    <SectionSubnavLayout
      subnav={
        <Suspense fallback={null}>
          <AccountingModuleNav links={links} companies={companies.map(({ id, name }) => ({ id, name }))} />
        </Suspense>
      }
    >
      {children}
    </SectionSubnavLayout>
  );
}
