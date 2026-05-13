import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PayableList } from "@/features/ap";
import type { PayableListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listCompanyPayables, ServiceError } from "@bloqer/services";

const STATUSES = ["OPEN", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const;

interface PageProps {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}

export default async function FinanzasCuentasPorPagarPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const status =
    sp.status && (STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof STATUSES)[number])
      : undefined;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let payables;
  try {
    payables = await listCompanyPayables(ctx, {
      status,
      dueDateFrom: sp.from,
      dueDateTo:   sp.to,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const items: PayableListItem[] = payables.map((p) => ({
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pagos pendientes</h1>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Obligaciones de empresa <strong>sin proyecto</strong> (misma base que el aging global). Desde acá abrís el detalle
        y registrás pagos.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Estado:</span>
        <Button asChild variant={!status ? "secondary" : "outline"} size="sm">
          <Link href="/finanzas/cuentas-por-pagar">Todas</Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
            <Link href={`/finanzas/cuentas-por-pagar${q({ status: s, from: sp.from, to: sp.to })}`}>
              {statusLabel[s] ?? s}
            </Link>
          </Button>
        ))}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Saldos empresa</h2>
        </div>
        <div className="p-6">
          <PayableList
            payables={items}
            hrefPrefix="/finanzas/cuentas-por-pagar"
            supplierInvoiceHrefPrefix="/finanzas/facturas-proveedor"
          />
        </div>
      </div>
    </div>
  );
}
