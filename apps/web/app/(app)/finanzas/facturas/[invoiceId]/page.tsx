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
import { formatInvoiceLetterBadge, IIBB_PERCEPTION_LABEL_ES, fiscalDocumentKindLabel } from "@bloqer/domain";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { FiscalDocumentKindBadge } from "@/features/finance/components/fiscal-document-kind-badge";
import { EntityDocumentsPanel } from "@/features/documents";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured } from "@bloqer/config";
import {
  canEditCompanyAr,
  getCompanySalesInvoiceById,
  getReceivableBySalesInvoiceId,
  listCreditDebitNotesForSalesInvoice,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import {
  cancelCompanySalesCreditNoteAction,
  cancelCompanySalesInvoiceAction,
  issueCompanySalesCreditNoteAction,
  issueCompanySalesDebitNoteAction,
  issueCompanySalesInvoiceAction,
} from "../actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctFromString,
  formatUnitPriceFromString,
} from "@/lib/format-money";
import { CreateFiscalNoteDialog } from "@/features/finance/components/create-fiscal-note-dialog";
import { RelatedFiscalNotesPanel } from "@/features/finance/components/related-fiscal-notes-panel";
import { compareDecimal } from "@bloqer/utils";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

function fmtDate(d: Date) {
  return formatDate(d);
}

function fmtMoney(value: string, currency: string) {
  return formatMoneyAmount(value, currency);
}

function hasOpenBalanceDue(balanceDue: string): boolean {
  try {
    return compareDecimal(balanceDue, "0") > 0;
  } catch {
    return false;
  }
}

export default async function FinanzasFacturaVentaDetailPage({
  params,
  searchParams,
}: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { invoiceId } = await params;
  const sp = await searchParams;
  const detailPath = `/finanzas/facturas/${invoiceId}`;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  let receivable = null;
  let relatedNotes: Awaited<ReturnType<typeof listCreditDebitNotesForSalesInvoice>> = [];
  let referencedCode: string | null = null;
  try {
    invoice = await getCompanySalesInvoiceById(invoiceId, ctx);
    receivable = await getReceivableBySalesInvoiceId(invoiceId, ctx);
    if ((invoice.documentKind ?? "INVOICE") === "INVOICE") {
      relatedNotes = await listCreditDebitNotesForSalesInvoice(invoiceId, ctx);
    }
    if (invoice.referencedSalesInvoiceId) {
      const parent = await getCompanySalesInvoiceById(invoice.referencedSalesInvoiceId, ctx);
      referencedCode = parent.code;
    }
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }
  if (invoice.projectId !== null) {
    redirect(`/proyectos/${invoice.projectId}/facturas/${invoiceId}`);
  }

  const invoiceAttachments = await listEntityDocuments("SALES_INVOICE", invoiceId, ctx, {});
  const storageConfigured = isStorageConfigured();
  const canEditAr = canEditCompanyAr(ctx.roles);
  const canEditAttachments = canEditAr;

  const kind = invoice.documentKind ?? "INVOICE";
  const isInvoice = kind === "INVOICE";
  const isCreditNote = kind === "CREDIT_NOTE";
  const isDebitNote = kind === "DEBIT_NOTE";
  const canCollect =
    canEditAr &&
    !isCreditNote &&
    receivable &&
    (receivable.status === "OPEN" ||
      receivable.status === "PARTIAL" ||
      receivable.status === "OVERDUE");
  const canIssueNc =
    canEditAr &&
    invoice.status === "ISSUED" &&
    isInvoice &&
    receivable != null &&
    hasOpenBalanceDue(receivable.balanceDue);
  const canIssueNd = canEditAr && invoice.status === "ISSUED" && isInvoice;

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{invoice.code}</h1>
            <SalesInvoiceStatusBadge status={invoice.status} />
            <FiscalDocumentKindBadge documentKind={kind} />
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

        <div className="flex flex-wrap items-center gap-2">
          {canEditAr && invoice.status === "DRAFT" ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/finanzas/facturas/${invoiceId}/editar`}>Editar</Link>
              </Button>
              {isInvoice ? (
                <form
                  action={async () => {
                    "use server";
                    const result = await issueCompanySalesInvoiceAction(invoiceId);
                    if ("error" in result) redirectWithActionError(detailPath, result.error);
                    redirect(detailPath);
                  }}
                >
                  <Button size="sm">Emitir</Button>
                </form>
              ) : null}
              {isCreditNote ? (
                <form
                  action={async () => {
                    "use server";
                    const result = await issueCompanySalesCreditNoteAction(invoiceId);
                    if ("error" in result) redirectWithActionError(detailPath, result.error);
                    redirect(detailPath);
                  }}
                >
                  <Button size="sm">Emitir nota de crédito</Button>
                </form>
              ) : null}
              {isDebitNote ? (
                <form
                  action={async () => {
                    "use server";
                    const result = await issueCompanySalesDebitNoteAction(invoiceId);
                    if ("error" in result) redirectWithActionError(detailPath, result.error);
                    redirect(detailPath);
                  }}
                >
                  <Button size="sm">Emitir nota de débito</Button>
                </form>
              ) : null}
            </>
          ) : null}
          {canIssueNc ? (
            <CreateFiscalNoteDialog
              kind="CREDIT_NOTE"
              parentInvoiceId={invoiceId}
              parentCode={invoice.code}
              currency={invoice.currency}
              openBalance={receivable!.balanceDue}
              scope={{ type: "company-ar" }}
            />
          ) : null}
          {canIssueNd ? (
            <CreateFiscalNoteDialog
              kind="DEBIT_NOTE"
              parentInvoiceId={invoiceId}
              parentCode={invoice.code}
              currency={invoice.currency}
              scope={{ type: "company-ar" }}
            />
          ) : null}
          {canEditAr && invoice.status !== "CANCELLED" ? (
            <form
              action={async () => {
                "use server";
                const result = isCreditNote
                  ? await cancelCompanySalesCreditNoteAction(invoiceId)
                  : await cancelCompanySalesInvoiceAction(invoiceId);
                if ("error" in result) redirectWithActionError(detailPath, result.error);
                redirect(detailPath);
              }}
            >
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Anular
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <ActionErrorBanner message={sp.actionError} />

      <RelatedFiscalNotesPanel
        notes={relatedNotes}
        hrefFor={(noteId) => `/finanzas/facturas/${noteId}`}
      />

      {receivable ? (
        <div className="rounded-lg border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {isDebitNote ? "Cuenta por cobrar de esta ND" : "Cuenta por cobrar vinculada"}
              </p>
              <p className="text-xs text-muted-foreground">
                Saldo pendiente: {fmtMoney(receivable.balanceDue, receivable.currency)}
                {Number(receivable.creditedAmount) > 0
                  ? ` · Créditos NC: ${fmtMoney(receivable.creditedAmount, receivable.currency)}`
                  : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/finanzas/cuentas-por-cobrar/${receivable.id}`}>Ver C×C</Link>
              </Button>
              {canCollect ? (
                <Button size="sm" asChild>
                  <Link href={`/finanzas/cuentas-por-cobrar/${receivable.id}/cobrar`}>
                    Registrar cobranza
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : isCreditNote ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">Nota de crédito</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {invoice.status === "DRAFT"
              ? "Al emitir, reduce el saldo de la factura de referencia sin movimiento de caja."
              : "Aplicada a la CxC de la factura de referencia (sin cobranza)."}
          </p>
        </div>
      ) : invoice.status === "DRAFT" && isDebitNote ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">Nota de débito en borrador</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Al emitir abre una CxC nueva (aumenta la deuda del cliente).
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Datos del comprobante</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Tipo de documento</dt>
            <dd className="font-medium">{fiscalDocumentKindLabel(kind)}</dd>
          </div>
          {invoice.referencedSalesInvoiceId ? (
            <div>
              <dt className="text-muted-foreground">Factura de referencia</dt>
              <dd className="font-medium">
                <Link
                  href={`/finanzas/facturas/${invoice.referencedSalesInvoiceId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {referencedCode ?? "Ver factura"}
                </Link>
              </dd>
            </div>
          ) : null}
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
          {invoice.notes ? (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{invoice.notes}</dd>
            </div>
          ) : null}
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
                  <TableCell className="text-right font-mono">
                    {formatQtyFromString(l.quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatUnitPriceFromString(l.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatRatePctFromString(l.discountPct)}%
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatRatePctFromString(l.taxRate)}%
                  </TableCell>
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {IIBB_PERCEPTION_LABEL_ES} ({formatRatePctFromString(invoice.iibbPerceptionRate)}%)
                </span>
                <span className="font-mono">
                  {fmtMoney(invoice.iibbPerceptionAmount, invoice.currency)}
                </span>
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
        scope={{ kind: "company-finanzas", afterUploadPath: detailPath }}
        linkedEntity={{ type: "SALES_INVOICE", id: invoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
