import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { Pagination } from "@/components/ui/pagination";
import { PageShell } from "@/components/layout/page-shell";
import { PaymentListSection, type PaymentListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listCompanyPayments, ServiceError } from "@bloqer/services";

const PAGE_SIZE = 20;
const STATUSES = ["CONFIRMED", "CANCELLED"] as const;

interface PageProps {
  searchParams: Promise<{ status?: string; from?: string; to?: string; page?: string }>;
}

export default async function FinanzasPagosProveedorPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const status =
    sp.status && (STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof STATUSES)[number])
      : undefined;
  const page = Math.max(1, Number(sp.page ?? 1));

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let result;
  try {
    result = await listCompanyPayments(ctx, {
      status,
      paymentDateFrom: sp.from,
      paymentDateTo: sp.to,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const items: PaymentListItem[] = result.data.map((p) => ({
    id: p.id,
    paymentDate: p.paymentDate,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    accountName: p.accountName,
    supplierInvoiceId: p.supplierInvoiceId,
  }));

  function q(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (next.status) p.set("status", next.status);
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagos a proveedor</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Pagos registrados sobre obligaciones de empresa <strong>sin proyecto</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <ListViewToggle storageKey="finanzas-pagos-proveedor" />
          </Suspense>
          <Button asChild variant="outline">
            <Link href="/finanzas/transacciones?tab=obligaciones">Ver obligaciones</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Estado:</span>
        <Button asChild variant={!status ? "secondary" : "outline"} size="sm">
          <Link href="/finanzas/pagos-proveedor">Todos</Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
            <Link href={`/finanzas/pagos-proveedor${q({ status: s, from: sp.from, to: sp.to })}`}>
              {s === "CONFIRMED" ? "Confirmados" : "Cancelados"}
            </Link>
          </Button>
        ))}
      </div>

      <Suspense fallback={<ListSectionSkeleton />}>
        <PaymentListSection payments={items} hrefPrefix="/finanzas/pagos-proveedor" />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
      </Suspense>
    </PageShell>
  );
}
