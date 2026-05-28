"use client";

import { ModuleSubnav, type ModuleSubnavLink } from "@/components/layout/module-subnav";

const LINKS: ModuleSubnavLink[] = [
  { href: "/configuracion", label: "Resumen", match: "exact" },
  { href: "/configuracion/perfil", label: "Mi perfil" },
  { href: "/configuracion/equipo", label: "Equipo" },
  { href: "/configuracion/permisos", label: "Permisos" },
];

export function ConfiguracionSubnav() {
  return (
    <ModuleSubnav
      links={LINKS}
      ariaLabel="Navegación de configuración"
      sectionLabel="Configuración"
    />
  );
}
