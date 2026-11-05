import Link from "next/link";
import { redirect } from "next/navigation";
import { JournalEntryForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { requireAccountingPageCompany } from "@/lib/accounting-page-company";
import type { EmpresaSearch } from "@/lib/accounting-search-params";
import { listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default async function NuevoAsientoPage({ searchParams }: { searchParams: Promise<EmpresaSearch> }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const { ctx, cf } = await requireAccountingPageCompany(await searchParams);
  const { data: accounts } = await listAccountingAccounts(ctx, cf);

  const picks = accounts.filter((a) => a.isActive).map(({ id, code, name }) => ({ id, code, name }));

  if (picks.length === 0) {
    return (
      <PageShell variant="default" className="space-y-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Nuevo asiento manual</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Creá al menos una cuenta contable antes de cargar asientos.
        </p>
        <Button asChild>
          <Link href={`/contabilidad/cuentas/nueva?empresa=${encodeURIComponent(cf.companyId)}`}>Nueva cuenta</Link>
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo asiento manual</h1>
      </div>
      <JournalEntryForm
        mode="create"
        accounts={picks}
        defaultCompanyId={cf.companyId}
      />
    </PageShell>
  );
}
