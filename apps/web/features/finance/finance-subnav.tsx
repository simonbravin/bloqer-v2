"use client";

import { ModuleSubnav } from "@/components/layout/module-subnav";
import type { FinanceSubnavLinkDTO } from "./finance-subnav-links";

export function FinanceSubnav({ links }: { links: FinanceSubnavLinkDTO[] }) {
  return (
    <ModuleSubnav
      links={links.map((l) => ({
        href: l.href,
        label: l.label,
        title: l.title,
        match: l.href === "/finanzas" ? "exact" : "prefix",
      }))}
      ariaLabel="Navegación de finanzas"
      sectionLabel="Finanzas empresa"
    />
  );
}
