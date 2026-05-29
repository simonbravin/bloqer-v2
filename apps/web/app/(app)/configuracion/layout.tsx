import { SearchParamsToast } from "@/components/feedback/search-params-toast";
import { ConfiguracionSubnav } from "@/components/configuracion/configuracion-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { getCurrentUser } from "@/lib/auth";
import { buildConfiguracionSubnavLinks } from "@/lib/configuracion-subnav";
import { redirect } from "next/navigation";

export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const links = buildConfiguracionSubnavLinks(current.tenantCtx.roles);

  return (
    <SectionSubnavLayout subnav={<ConfiguracionSubnav links={links} />}>
      <SearchParamsToast />
      {children}
    </SectionSubnavLayout>
  );
}
