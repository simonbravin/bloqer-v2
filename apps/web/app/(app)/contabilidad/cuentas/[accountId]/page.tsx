import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountLedgerTable, AccountTypeBadge } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getAccountingAccountById, getAccountLedger } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { listAccountLedgerSchema } from "@bloqer/validators";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";

export default async function CuentaContableDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const { accountId } = await params;
  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let account;
  try {
    account = await getAccountingAccountById(accountId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }

  const ledgerParsed = listAccountLedgerSchema.safeParse({
    accountId,
    companyId: cf.companyId ?? null,
    limit:     200,
  });
  const ledger = ledgerParsed.success
    ? await getAccountLedger(ctx, ledgerParsed.data)
    : [];

  const q = cf.companyId ? `?empresa=${encodeURIComponent(cf.companyId)}` : "";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/contabilidad/cuentas${q}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight font-mono">{account.code}</h1>
        <AccountTypeBadge type={account.type} />
      </div>
      <div className="rounded-lg border bg-card p-6 space-y-2">
        <h2 className="text-lg font-semibold">{account.name}</h2>
        {account.description && <p className="text-sm text-muted-foreground">{account.description}</p>}
        <p className="text-sm text-muted-foreground">{account.isActive ? "Activa" : "Inactiva"}</p>
      </div>
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Mayor (solo contabilizado)</h2>
        </div>
        <div className="p-6 overflow-x-auto">
          <AccountLedgerTable rows={ledger} />
        </div>
      </div>
    </div>
  );
}
