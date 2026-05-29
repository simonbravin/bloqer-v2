"use client";

import type { ModuleSubnavLink } from "@/components/layout/module-subnav";
import { ModuleSubnav } from "@/components/layout/module-subnav";

export function ConfiguracionSubnav({ links }: { links: ModuleSubnavLink[] }) {
  return (
    <ModuleSubnav
      links={links}
      ariaLabel="Navegación de configuración"
      sectionLabel="Configuración"
    />
  );
}
