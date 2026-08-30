import { formatDate } from "@/lib/format";
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
import { formatInvoiceLetterBadge } from "@bloqer/domain";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getReceivableBySalesInvoiceId,
  getSalesInvoiceById,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import { issueSalesInvoiceAction, cancelSalesInvoiceAction } from "../actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { formatMoneyAmount, formatQtyFromString, formatRatePctFromString, formatUnitPriceFromString } from "@/lib/format-money";

interface PageProps {
  params: Promise<{ id: string; invoiceId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

function fmtDate(d: Date) {
  return formatDate(d);
}

function fmtMoney(value: string, currency: string) {
  return formatMoneyAmount(value, currency);
}

export default async function FacturaDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, invoiceId } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  let receivable = null;
  try {
    invoice = await getSalesInvoiceById(invoiceId, ctx, id);
    receivable = await getReceivableBySalesInvoiceId(invoiceId, ctx, id);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  if (invoice.projectId !== id || (receivable && receivable.projectId !== id)) notFound();

  const invoiceAttachments = await listEntityDocuments("SALES_INVOICE", invoiceId, ctx, {
    projectId: id,
  });
  const storageConfigured = isStorageConfigured();
  const canEditAr = can(current.tenantCtx.roles, "EDIT", "AR");
  const canEditAttachments = canEditAr;

  const returnPath = `/proyectos/${id}/facturas/${invoiceId}`;
  const canCollect =
    canEditAr &&
    receivable &&
    (receivable.status === "OPEN" ||
      receivable.status === "PARTIAL" ||
      receivable.status === "OVERDUE");

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{invoice.code}</h1>
              <SalesInvoiceStatusBadge status={invoice.status} />
              {formatInvoiceLetterBadge(invoice.invoiceLetter) ? (
                <span className="rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {formatInvoiceLetterBadge(invoice.invoiceLetter)}
                </span>
              ) : null}
              {invoice.classLabel ? (
                <DocumentClassBadge
                  classLabel={invoice.classLabel}
                  classFamily={invoice.classFamily}
                />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{invoice.clientName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEditAr && invoice.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${id}/facturas/${invoiceId}/editar`}>Editar</Link>
              </Button>
              <form
                action={async () => {
                  "use server";
                  const result = await issueSalesInvoiceAction(invoiceId, id);
                  if ("error" in result) redirectWithActionError(returnPath, result.error);
                  redirect(returnPath);
                }}
              >
                <Button size="sm">Emitir</Button>
              </form>
            </>
          )}
          {canEditAr && invoice.status !== "CANCELLED" && (
            <form
              action={async () => {
                "use server";
                const result = await cancelSalesInvoiceAction(invoiceId, id);
                if ("error" in result) redirectWithActionError(returnPath, result.error);
                redirect(returnPath);
              }}
            >
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Anular
              </Button>
            </form>
          )}
        </div>
      </div>

      <ActionErrorBanner message={sp.actionError} />

      {receivable ? (
        <div className="rounded-lg border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Cuenta por cobrar vinculada</p>
              <p className="text-xs text-muted-foreground">
                Saldo pendiente: {fmtMoney(receivable.balanceDue, receivable.currency)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${id}/cuentas-por-cobrar/${receivable.id}`}>Ver C×C</Link>
              </Button>
              {canCollect ? (
                <Button size="sm" asChild>
                  <Link href={`/proyectos/${id}/cuentas-por-cobrar/${receivable.id}/cobrar`}>
                    Registrar cobranza
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : invoice.status === "DRAFT" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">Borrador sin cuenta por cobrar</p>
          <p className="mt-1 text-xs">
            Usá <strong>Emitir</strong> para abrir la CxC. La certificación (si hay) no acredita
            banco: la cobranza posterior, con cuenta de tesorería, es el paso de caja.
          </p>
        </div>
      ) : invoice.status === "ISSUED" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">Factura emitida sin CxC vinculada</p>
          <p className="mt-1 text-xs">
            Estado inconsistente: debería existir una cuenta por cobrar. Revisá con soporte o
            regenerá desde el flujo de emisión si corresponde.
          </p>
        </div>
      ) : null}

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
                <TableHead className="text-right">Desc. %</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right font-mono">{formatQtyFromString(l.quantity)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatUnitPriceFromString(l.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatRatePctFromString(l.discountPct)}%</TableCell>
                  <TableCell className="text-right font-mono">{formatRatePctFromString(l.taxRate)}%</TableCell>
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

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId: id }}
        linkedEntity={{ type: "SALES_INVOICE", id: invoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
