import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { TESORERIA_SUBNAV_LINKS } from "@/lib/tesoreria-subnav";

export default function TesoreriaLayout({ children }: { children: ReactNode }) {
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
