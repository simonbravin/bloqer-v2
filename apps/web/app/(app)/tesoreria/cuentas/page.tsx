import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { TreasuryAccountListSection } from "@/features/treasury";
import type { TreasuryAccountListItem } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { listTreasuryAccounts } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

export default async function CuentasPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const { data: accounts } = await listTreasuryAccounts(ctx);

  const items: TreasuryAccountListItem[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    balance: a.balance,
    status: a.status,
    bankName: a.bankName,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href="/tesoreria" label="Volver" />
          <h1 className="text-2xl font-bold tracking-tight">Cuentas</h1>
        </div>
        <Button asChild>
          <Link href="/tesoreria/cuentas/nueva">+ Nueva cuenta</Link>
        </Button>
      </div>

      <div className="flex justify-end">
        <Suspense fallback={null}>
          <ListViewToggle />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <TreasuryAccountListSection accounts={items} />
      </Suspense>
    </PageShell>
  );
}
