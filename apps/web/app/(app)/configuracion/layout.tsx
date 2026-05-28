import { SearchParamsToast } from "@/components/feedback/search-params-toast";
import { ConfiguracionSubnav } from "@/components/configuracion/configuracion-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionSubnavLayout subnav={<ConfiguracionSubnav />}>
      <SearchParamsToast />
      {children}
    </SectionSubnavLayout>
  );
}
