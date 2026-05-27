import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { Pagination } from "@/components/ui/pagination";
import { getCurrentUser } from "@/lib/auth";
import { listInternalTransfers } from "@bloqer/services";
import { InternalTransferListSection } from "@/features/treasury/components/internal-transfer-list-section";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const { data: transfers, total } = await listInternalTransfers(ctx, {
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href="/tesoreria" label="Volver" />
          <h1 className="text-2xl font-bold tracking-tight">Transferencias internas</h1>
        </div>
        <Button asChild>
          <Link href="/tesoreria/transferencias/nueva">+ Nueva transferencia</Link>
        </Button>
      </div>

      <div className="flex justify-end">
        <Suspense fallback={null}>
          <ListViewToggle />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <InternalTransferListSection transfers={transfers} />
      </Suspense>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </PageShell>
  );
}
