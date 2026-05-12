import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TreasuryAccountList } from "@/features/treasury";
import type { TreasuryAccountListItem } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { listTreasuryAccounts } from "@bloqer/services";

export default async function CuentasPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const accounts = await listTreasuryAccounts(ctx);

  const items: TreasuryAccountListItem[] = accounts.map((a) => ({
    id:       a.id,
    name:     a.name,
    type:     a.type,
    currency: a.currency,
    balance:  a.balance,
    status:   a.status,
    bankName: a.bankName,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tesoreria">← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Cuentas</h1>
        </div>
        <Button asChild>
          <Link href="/tesoreria/cuentas/nueva">+ Nueva cuenta</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Cuentas de tesorería</h2>
        </div>
        <div className="p-6">
          <TreasuryAccountList accounts={items} />
        </div>
      </div>
    </div>
  );
}
