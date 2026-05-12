import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { JournalEntryForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCompanies, listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";

export default async function NuevoAsientoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const ctx = (await buildTenantServiceContext())!;
  const [companies, accounts] = await Promise.all([
    getCompanies(ctx),
    listAccountingAccounts(ctx, {}),
  ]);

  const picks = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));

  if (picks.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contabilidad/asientos">← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Nuevo asiento manual</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Creá al menos una cuenta contable antes de cargar asientos.
        </p>
        <Button asChild><Link href="/contabilidad/cuentas/nueva">Nueva cuenta</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/contabilidad/asientos">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo asiento manual</h1>
      </div>
      <JournalEntryForm
        mode="create"
        accounts={picks}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        defaultCompanyId={current.tenantCtx.companyId}
      />
    </div>
  );
}
