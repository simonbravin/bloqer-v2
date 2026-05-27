import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import { SalesInvoiceStatusBadge } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { getSalesInvoiceById, ServiceError } from "@bloqer/services";
import { issueSalesInvoiceAction, cancelSalesInvoiceAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

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
    ) +
    " " +
    currency
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

  const doIssue = async () => {
    "use server";
    await issueSalesInvoiceAction(invoiceId, id);
  };
  const doCancel = async () => {
    "use server";
    await cancelSalesInvoiceAction(invoiceId, id);
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href={`/proyectos/${id}/facturas`} label="Volver" />
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
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Anular
              </Button>
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

      <DataTableSection title="Líneas">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">P. Unit.</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right font-mono">{l.quantity}</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtMoney(l.unitPrice, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{l.taxRate}%</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtMoney(l.lineTotal, invoice.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
        </TableScroll>
      </DataTableSection>
    </PageShell>
  );
}
