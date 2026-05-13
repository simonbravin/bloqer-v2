import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SupplierInvoiceList } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listCompanySupplierInvoices, ServiceError } from "@bloqer/services";

const STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;

interface PageProps {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}

export default async function FinanzasFacturasProveedorPage({ searchParams }: PageProps) {
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

  let invoices;
  try {
    invoices = await listCompanySupplierInvoices(ctx, {
      status,
      issueDateFrom: sp.from,
      issueDateTo:   sp.to,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const items: SupplierInvoiceListItem[] = invoices.map((inv) => ({
    id:           inv.id,
    code:         inv.code,
    supplierName: inv.supplierName,
    issueDate:    inv.issueDate,
    dueDate:      inv.dueDate,
    totalAmount:  inv.totalAmount,
    currency:     inv.currency,
    status:       inv.status,
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/finanzas">← Finanzas</Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Facturas de proveedor (empresa)</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Gastos generales y facturas de proveedor <strong>sin obra asignada</strong>. Generan cuenta por pagar al
            emitirlas, igual que en proyecto. No aparecen en el espacio de trabajo de una obra.
          </p>
        </div>
        <Button asChild>
          <Link href="/finanzas/facturas-proveedor/nueva">Nueva factura</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Estado:</span>
        <Button asChild variant={!status ? "secondary" : "outline"} size="sm">
          <Link href="/finanzas/facturas-proveedor">Todas</Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
            <Link href={`/finanzas/facturas-proveedor${q({ status: s, from: sp.from, to: sp.to })}`}>
              {s === "DRAFT" ? "Borrador" : s === "ISSUED" ? "Emitidas" : "Anuladas"}
            </Link>
          </Button>
        ))}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Listado</h2>
        </div>
        <div className="p-6">
          {items.length === 0 ? (
            <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
              <p>No hay facturas corporativas con los filtros actuales.</p>
              <p>
                Acá cargás <strong>gastos generales</strong> de la empresa (servicios, suministros no imputados a una
                obra, etc.). Si la compra es de una obra, usá{" "}
                <Link href="/proyectos" className="underline underline-offset-2 text-foreground">
                  Proyectos
                </Link>
                .
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/finanzas/facturas-proveedor/nueva">Crear primera factura</Link>
              </Button>
            </div>
          ) : (
            <SupplierInvoiceList invoices={items} hrefPrefix="/finanzas/facturas-proveedor" />
          )}
        </div>
      </div>
    </div>
  );
}
