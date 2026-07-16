import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { CONTABILIDAD_SUBNAV_LINKS } from "@/lib/contabilidad-subnav";

export default function ContabilidadLayout({ children }: { children: ReactNode }) {
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
