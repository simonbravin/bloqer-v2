import { redirect, notFound } from "next/navigation";
import { JournalEntryForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { requireAccountingPageCompany } from "@/lib/accounting-page-company";
import { getJournalEntryById, listAccountingAccounts } from "@bloqer/services";
import { contabilidadAsientoHref } from "@/lib/contabilidad-asiento-path";
import { can } from "@bloqer/domain";
import type { EmpresaSearch } from "@/lib/accounting-search-params";
import { formatDate } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";

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
  const { ctx, cf } = await requireAccountingPageCompany(sp);

  let entry;
  try {
    entry = await getJournalEntryById(journalEntryId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }
  if (entry.status !== "DRAFT") redirect(contabilidadAsientoHref(entry.id, entry.companyId, ctx.companyId));

  const accountsResult = await listAccountingAccounts(ctx, { companyId: entry.companyId });
  const picks = accountsResult.data.map((a) => ({ id: a.id, code: a.code, name: a.name }));

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={entry.reference ?? formatDate(entry.entryDate)}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Editar asiento</h1>
      </div>
      <JournalEntryForm
        mode="edit"
        entryId={journalEntryId}
        initial={entry}
        accounts={picks}
        defaultCompanyId={entry.companyId}
      />
    </PageShell>
  );
}
