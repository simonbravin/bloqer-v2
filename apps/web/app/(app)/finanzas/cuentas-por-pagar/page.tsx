import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { TransaccionesDateFilters } from "@/features/finance/components/transacciones-date-filters";
import { PayableListSection } from "@/features/ap";
import type { PayableListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listCompanyPayables, ServiceError } from "@bloqer/services";
import { Pagination } from "@/components/ui/pagination";
import { PageShell } from "@/components/layout/page-shell";

const PAGE_SIZE = 20;
const STATUSES = ["OPEN", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const;

interface PageProps {
  searchParams: Promise<{ status?: string; from?: string; to?: string; page?: string }>;
}

export default async function FinanzasCuentasPorPagarPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const showAllStates = sp.status === "ALL";
  const status =
    sp.status && !showAllStates && (STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof STATUSES)[number])
      : undefined;
  const pendingOnly = !showAllStates && !status;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let result;
  try {
    result = await listCompanyPayables(ctx, {
      status,
      pendingOnly,
      dueDateFrom: sp.from,
      dueDateTo:   sp.to,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const items: PayableListItem[] = result.data.map((p) => ({
    id:                   p.id,
    supplierName:         p.supplierName,
    dueDate:              p.dueDate,
    status:               p.status,
    originalAmount:       p.originalAmount,
    paidAmount:           p.paidAmount,
    balanceDue:           p.balanceDue,
    currency:             p.currency,
    supplierInvoiceId:    p.supplierInvoiceId,
    supplierInvoiceCode: p.supplierInvoiceCode,
  }));

  function q(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (next.status) p.set("status", next.status);
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  const statusLabel: Record<string, string> = {
    OPEN:     "Abiertas",
    PARTIAL:  "Parcial",
    PAID:     "Pagadas",
    OVERDUE:  "Vencidas",
    CANCELLED: "Canceladas",
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Pagos pendientes</h1>
        <Suspense fallback={null}>
          <ListViewToggle storageKey="finanzas-cuentas-por-pagar" />
        </Suspense>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Obligaciones de empresa <strong>sin proyecto</strong> (misma base que el aging global). Desde acá abrís el detalle
        y registrás pagos.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Estado:</span>
        <Button asChild variant={pendingOnly ? "secondary" : "outline"} size="sm">
          <Link href={`/finanzas/cuentas-por-pagar${q({ from: sp.from, to: sp.to })}`}>Pendientes</Link>
        </Button>
        <Button asChild variant={showAllStates ? "secondary" : "outline"} size="sm">
          <Link href={`/finanzas/cuentas-por-pagar${q({ status: "ALL", from: sp.from, to: sp.to })}`}>
            Todos los estados
          </Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
            <Link href={`/finanzas/cuentas-por-pagar${q({ status: s, from: sp.from, to: sp.to })}`}>
              {statusLabel[s] ?? s}
            </Link>
          </Button>
        ))}
      </div>

      <Suspense fallback={null}>
        <TransaccionesDateFilters preserveParams={["status"]} />
      </Suspense>

      <Suspense fallback={<ListSectionSkeleton />}>
        <PayableListSection
          payables={items}
          hrefPrefix="/finanzas/cuentas-por-pagar"
          supplierInvoiceHrefPrefix="/finanzas/facturas-proveedor"
        />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
      </Suspense>
    </PageShell>
  );
}
