import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { Pagination } from "@/components/ui/pagination";
import { getCurrentUser } from "@/lib/auth";
import { listInternalTransfers, ServiceError } from "@bloqer/services";
import { InternalTransferListSection } from "@/features/treasury/components/internal-transfer-list-section";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { parsePage } from "@/lib/parse-page";

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
  const page = parsePage(sp.page);

  let transfersResult;
  try {
    transfersResult = await listInternalTransfers(ctx, {
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/tesoreria");
    throw err;
  }

  const { data: transfers, total } = transfersResult;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Transferencias internas</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/tesoreria/movimientos?sourceType=INTERNAL_TRANSFER">
              Ver en movimientos
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/tesoreria/transferencias/nueva">Nueva transferencia</Link>
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Suspense fallback={null}>
          <ListViewToggle storageKey="tesoreria-transferencias" />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <InternalTransferListSection transfers={transfers} />
      </Suspense>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </PageShell>
  );
}
