import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { INVENTARIO_SUBNAV_LINKS } from "@/lib/inventario-subnav";

export default function InventarioLayout({ children }: { children: ReactNode }) {
  return (
    <SectionSubnavLayout
      subnav={
        <ModuleSubnav
          links={INVENTARIO_SUBNAV_LINKS}
          ariaLabel="Navegación de inventario"
          sectionLabel="Inventario"
        />
      }
    >
      {children}
    </SectionSubnavLayout>
  );
}
