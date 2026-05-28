"use client";

import { ModuleSubnav } from "@/components/layout/module-subnav";

const LINKS = [
  { href: "/platform", label: "Resumen", match: "exact" as const },
  { href: "/platform/tenants", label: "Organizaciones" },
  { href: "/platform/vencimientos", label: "Vencimientos" },
  { href: "/platform/registro", label: "Registro" },
];

export function PlatformMainSubnav() {
  return (
    <ModuleSubnav links={LINKS} ariaLabel="Navegación de plataforma" sectionLabel="Plataforma" />
  );
}
