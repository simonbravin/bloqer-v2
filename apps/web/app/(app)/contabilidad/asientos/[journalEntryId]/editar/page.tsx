import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { JournalEntryForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCompanies, getJournalEntryById, listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";

export default async function EditarAsientoPage({
  params,
  searchParams,
}: {
  params: Promise<{ journalEntryId: string }>;
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const { journalEntryId } = await params;
  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let entry;
  try {
    entry = await getJournalEntryById(journalEntryId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }
  if (entry.status !== "DRAFT") redirect(`/contabilidad/asientos/${journalEntryId}`);

  const [companies, accounts] = await Promise.all([
    getCompanies(ctx),
    listAccountingAccounts(ctx, { companyId: entry.companyId }),
  ]);
  const picks = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));

  const q = cf.companyId ? `?empresa=${encodeURIComponent(cf.companyId)}` : "";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/contabilidad/asientos/${journalEntryId}${q}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Editar asiento</h1>
      </div>
      <JournalEntryForm
        mode="edit"
        entryId={journalEntryId}
        initial={entry}
        accounts={picks}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        defaultCompanyId={current.tenantCtx.companyId}
      />
    </div>
  );
}
