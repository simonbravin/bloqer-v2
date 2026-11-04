import { SearchParamsToast } from "@/components/feedback/search-params-toast";
import { ConfiguracionSubnav } from "@/components/configuracion/configuracion-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { getCurrentUser } from "@/lib/auth";
import { buildConfiguracionSubnavLinks } from "@/lib/configuracion-subnav";
import { redirect } from "next/navigation";
import { getTenantModuleGate } from "@bloqer/services";

export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const gate = await getTenantModuleGate({
    actorUserId: current.session.user.id,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  });
  const links = buildConfiguracionSubnavLinks(current.tenantCtx.roles, (module) => gate.isEnabled(module));

  return (
    <SectionSubnavLayout subnav={<ConfiguracionSubnav links={links} />}>
      <SearchParamsToast />
      {children}
    </SectionSubnavLayout>
  );
}
