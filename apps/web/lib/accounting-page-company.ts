import { cache } from "react";
import { redirect } from "next/navigation";
import { getCompanies, type ServiceContext } from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";

export const loadAccountingPageContext = cache(async () => {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const companies = await getCompanies(ctx);
  return { ctx, companies };
});

export async function accountingPageCompany(search: EmpresaSearch) {
  const { ctx, companies } = await loadAccountingPageContext();
  const requestedCompany = companyQueryFilter(search).companyId;
  const company = ctx.companyId || search.empresa
    ? companies.find((item) => item.id === (ctx.companyId ?? requestedCompany)) ?? null
    : companies.length === 1 ? companies[0]! : null;

  return { ctx, companies, company };
}

/** D-092: a scoped membership wins, and a tenant-wide membership chooses among active companies. */
export async function requireAccountingPageCompany(search: EmpresaSearch): Promise<{
  ctx: ServiceContext;
  cf: { companyId: string };
  company: Awaited<ReturnType<typeof getCompanies>>[number];
}> {
  const { ctx, company } = await accountingPageCompany(search);
  if (!company) redirect("/contabilidad");
  return { ctx, cf: { companyId: company.id }, company };
}
