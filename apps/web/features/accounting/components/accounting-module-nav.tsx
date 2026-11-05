"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ModuleSubnav, type ModuleSubnavLink } from "@/components/layout/module-subnav";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AccountingModuleNav({
  links,
  companies,
}: {
  links: ModuleSubnavLink[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const selected = companies.find((company) => company.id === search.get("empresa"));
  const contextQuery = selected ? `?empresa=${encodeURIComponent(selected.id)}` : "";

  return (
    <div className="space-y-3">
      {companies.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="accounting-company">Empresa</Label>
          <Select
            value={selected?.id ?? ""}
            onValueChange={(companyId) => router.push(`/contabilidad?empresa=${encodeURIComponent(companyId)}`)}
          >
            <SelectTrigger id="accounting-company" className="w-full sm:w-72">
              <SelectValue placeholder="Elegí una empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <ModuleSubnav
        links={links.map((link) => ({ ...link, href: `${link.href}${contextQuery}` }))}
        ariaLabel="Navegación de contabilidad"
        sectionLabel="Contabilidad"
        wrap
      />
    </div>
  );
}
