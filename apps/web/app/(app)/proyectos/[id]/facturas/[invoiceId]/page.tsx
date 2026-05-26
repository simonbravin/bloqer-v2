import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SalesInvoiceStatusBadge } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { getSalesInvoiceById, ServiceError } from "@bloqer/services";
import { issueSalesInvoiceAction, cancelSalesInvoiceAction } from "../actions";

interface PageProps {
  params: Promise<{ id: string; invoiceId: string }>;
}

function fmtDate(d: Date) {
  return formatDate(d);
}

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) + " " + currency
  );
}

export default async function FacturaDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, invoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  try {
    invoice = await getSalesInvoiceById(invoiceId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const doIssue  = async () => { "use server"; await issueSalesInvoiceAction(invoiceId, id); };
  const doCancel = async () => { "use server"; await cancelSalesInvoiceAction(invoiceId, id); };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}/facturas`}>← Volver</Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{invoice.code}</h1>
              <SalesInvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-muted-foreground">{invoice.clientName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invoice.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${id}/facturas/${invoiceId}/editar`}>Editar</Link>
              </Button>
              <form action={doIssue}>
                <Button size="sm">Emitir</Button>
              </form>
            </>
          )}
          {invoice.status !== "CANCELLED" && (
            <form action={doCancel}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">Anular</Button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Datos de la factura</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Emisión</dt>
            <dd className="font-medium">{fmtDate(invoice.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vencimiento</dt>
            <dd className="font-medium">{fmtDate(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Moneda</dt>
            <dd className="font-medium">{invoice.currency}</dd>
          </div>
          {invoice.certificationId && (
            <div>
              <dt className="text-muted-foreground">Certificación</dt>
              <dd className="font-medium">
                <Link
                  href={`/proyectos/${id}/certificaciones/${invoice.certificationId}`}
                  className="underline underline-offset-2"
                >
                  Ver certificación
                </Link>
              </dd>
            </div>
          )}
          {invoice.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{invoice.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Líneas</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-6 py-3 text-muted-foreground font-normal">Descripción</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-normal">Cant.</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-normal">P. Unit.</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-normal">IVA %</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-6 py-3">{l.description}</td>
                <td className="px-4 py-3 text-right font-mono">{l.quantity}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtMoney(l.unitPrice, invoice.currency)}</td>
                <td className="px-4 py-3 text-right font-mono">{l.taxRate}%</td>
                <td className="px-4 py-3 text-right font-mono">{fmtMoney(l.lineTotal, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-6 py-4 text-sm">
          <div className="ml-auto max-w-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{fmtMoney(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="font-mono">{fmtMoney(invoice.taxAmount, invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono">{fmtMoney(invoice.totalAmount, invoice.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
