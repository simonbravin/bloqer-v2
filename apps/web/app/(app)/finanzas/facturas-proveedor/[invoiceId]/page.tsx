import { formatDate } from "@/lib/format";
import { formatMoneyAmount, formatQtyFromString, formatRatePctFromString, formatUnitPriceFromString } from "@/lib/format-money";
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
import { TableScroll } from "@/components/ui/table-scroll";
import { PayableStatusBadge, SupplierInvoiceStatusBadge, supplierInvoiceProcessSteps } from "@/features/ap";
import { formatInvoiceLetterBadge, IIBB_PERCEPTION_LABEL_ES, can, fiscalDocumentKindLabel } from "@bloqer/domain";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { FiscalDocumentKindBadge } from "@/features/finance/components/fiscal-document-kind-badge";
import { EntityDocumentsPanel } from "@/features/documents";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured } from "@bloqer/config";
import {
  getCompanySupplierInvoiceById,
  getPayableBySupplierInvoiceId,
  listEntityDocuments,
  canRegisterApPayment,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import {
  issueCompanySupplierInvoiceAction,
  cancelCompanySupplierInvoiceAction,
  createCompanySupplierCreditNoteFromInvoiceAction,
  createCompanySupplierDebitNoteFromInvoiceAction,
  issueCompanySupplierCreditNoteAction,
  issueCompanySupplierDebitNoteAction,
  cancelCompanySupplierCreditNoteAction,
} from "@/app/(app)/finanzas/facturas-proveedor/actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProcessStepper } from "@/components/ui/process-stepper";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

export default async function FinanzasFacturaProveedorDetailPage({
  params,
  searchParams,
}: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { invoiceId } = await params;
  const sp = await searchParams;
  const detailPath = `/finanzas/facturas-proveedor/${invoiceId}`;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  try {
    invoice = await getCompanySupplierInvoiceById(invoiceId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  let payable = null;
  try {
    payable = await getPayableBySupplierInvoiceId(invoiceId, ctx);
  } catch (err) {
    // Missing payable returns null (not NOT_FOUND). FORBIDDEN must not soft-fail the stepper.
    if (err instanceof ServiceError && err.code === "FORBIDDEN") notFound();
    throw err;
  }

  const invoiceAttachments = await listEntityDocuments("SUPPLIER_INVOICE", invoiceId, ctx, {});
  const storageConfigured = isStorageConfigured();
  const canEditAp = can(current.tenantCtx.roles, "EDIT", "AP");
  const canEditAttachments = canEditAp;

  const isDraft = invoice.status === "DRAFT";
  const isIssued = invoice.status === "ISSUED";
  const isCancelled = invoice.status === "CANCELLED";
  const kind = invoice.documentKind ?? "INVOICE";
  const isInvoice = kind === "INVOICE";
  const isCreditNote = kind === "CREDIT_NOTE";
  const isDebitNote = kind === "DEBIT_NOTE";
  const openPayableBalance =
    payable != null && Number(payable.balanceDue) > 0;
  const canIssueNc =
    canEditAp && isIssued && isInvoice && payable != null && openPayableBalance;
  const canIssueNd = canEditAp && isIssued && isInvoice;
  const canPay =
    Boolean(payable) &&
    !isCreditNote &&
    canRegisterApPayment(current.tenantCtx.roles) &&
    (payable!.status === "OPEN" ||
      payable!.status === "PARTIAL" ||
      payable!.status === "OVERDUE");

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{invoice.code}</h1>
        <SupplierInvoiceStatusBadge status={invoice.status} />
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

      {isInvoice ? (
        <ProcessStepper
          aria-label="Progreso de la factura de proveedor"
          steps={supplierInvoiceProcessSteps({
            status: invoice.status,
            payableStatus: payable?.status ?? null,
            hasPayable: payable != null,
          })}
        />
      ) : (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">{fiscalDocumentKindLabel(kind)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isCreditNote
              ? invoice.status === "DRAFT"
                ? "Al emitir, reduce el saldo de la factura de referencia sin egreso de caja."
                : "Aplicada a la CxP de la factura de referencia (sin pago)."
              : invoice.status === "DRAFT"
                ? "Al emitir abre una CxP nueva (aumenta lo adeudado al proveedor)."
                : "Comprobante que incrementa la cuenta por pagar."}
          </p>
        </div>
      )}

      <ActionErrorBanner message={sp.actionError} />

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Tipo de documento</p>
            <p className="font-medium">{fiscalDocumentKindLabel(kind)}</p>
          </div>
          {invoice.referencedSupplierInvoiceId ? (
            <div>
              <p className="text-muted-foreground">Factura de referencia</p>
              <p className="font-medium">
                <Link
                  href={`/finanzas/facturas-proveedor/${invoice.referencedSupplierInvoiceId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Ver factura
                </Link>
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-muted-foreground">Proveedor</p>
            <p className="font-medium">{invoice.supplierName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda</p>
            <p className="font-medium">{invoice.currency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de emisión</p>
            <p className="font-medium">{formatDate(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de vencimiento</p>
            <p className="font-medium">{formatDate(invoice.dueDate)}</p>
          </div>
        </div>

        <hr />

        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Desc. %</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyFromString(line.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUnitPriceFromString(line.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRatePctFromString(line.discountPct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRatePctFromString(line.taxRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoneyAmount(line.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>

        <div className="flex justify-end gap-8 text-sm">
          <div className="text-right">
            <p className="text-muted-foreground">Subtotal</p>
            <p className="tabular-nums">{formatMoneyAmount(invoice.subtotal)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">IVA</p>
            <p className="tabular-nums">{formatMoneyAmount(invoice.taxAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">
              {IIBB_PERCEPTION_LABEL_ES} ({formatRatePctFromString(invoice.iibbPerceptionRate)}%)
            </p>
            <p className="tabular-nums">{formatMoneyAmount(invoice.iibbPerceptionAmount)}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Total</p>
            <p className="font-semibold tabular-nums">
              {formatMoneyAmount(invoice.totalAmount, invoice.currency)}
            </p>
          </div>
        </div>

        {invoice.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notas</p>
            <p className="text-sm">{invoice.notes}</p>
          </div>
        )}
      </div>

      {payable ? (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Cuenta por pagar</CardTitle>
            <PayableStatusBadge status={payable.status} />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Saldo pendiente:{" "}
              <span className="font-semibold tabular-nums">
                {formatMoneyAmount(payable.balanceDue, payable.currency)}
              </span>
              {Number(payable.creditedAmount) > 0
                ? ` · Créditos NC: ${formatMoneyAmount(payable.creditedAmount, payable.currency)}`
                : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/finanzas/cuentas-por-pagar/${payable.id}`}>Ver C×P</Link>
              </Button>
              {canPay ? (
                <Button asChild size="sm">
                  <Link href={`/finanzas/cuentas-por-pagar/${payable.id}/pagar`}>
                    Registrar pago
                  </Link>
                </Button>
              ) : payable.status === "OPEN" ||
                payable.status === "PARTIAL" ||
                payable.status === "OVERDUE" ? (
                <p className="text-xs text-muted-foreground w-full">
                  Finanzas o tesorería registra el pago y elige la cuenta bancaria.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canEditAp ? (
        <div className="flex flex-wrap gap-2">
          {isDraft && isInvoice && (
            <>
              <Button asChild variant="outline">
                <Link href={`/finanzas/facturas-proveedor/${invoiceId}/editar`}>Editar</Link>
              </Button>
              <form
                action={async () => {
                  "use server";
                  const result = await issueCompanySupplierInvoiceAction(invoiceId);
                  if ("error" in result) redirectWithActionError(detailPath, result.error);
                  redirect(detailPath);
                }}
              >
                <Button type="submit">Emitir factura</Button>
              </form>
            </>
          )}
          {isDraft && isCreditNote && (
            <form
              action={async () => {
                "use server";
                const result = await issueCompanySupplierCreditNoteAction(invoiceId);
                if ("error" in result) redirectWithActionError(detailPath, result.error);
                redirect(detailPath);
              }}
            >
              <Button type="submit">Emitir nota de crédito</Button>
            </form>
          )}
          {isDraft && isDebitNote && (
            <form
              action={async () => {
                "use server";
                const result = await issueCompanySupplierDebitNoteAction(invoiceId);
                if ("error" in result) redirectWithActionError(detailPath, result.error);
                redirect(detailPath);
              }}
            >
              <Button type="submit">Emitir nota de débito</Button>
            </form>
          )}
          {canIssueNc ? (
            <form
              action={async () => {
                "use server";
                const result = await createCompanySupplierCreditNoteFromInvoiceAction(invoiceId);
                if ("error" in result) redirectWithActionError(detailPath, result.error);
                redirect(`/finanzas/facturas-proveedor/${result.id}`);
              }}
            >
              <Button type="submit" variant="outline">
                Nota de crédito
              </Button>
            </form>
          ) : null}
          {canIssueNd ? (
            <form
              action={async () => {
                "use server";
                const result = await createCompanySupplierDebitNoteFromInvoiceAction(invoiceId);
                if ("error" in result) redirectWithActionError(detailPath, result.error);
                redirect(`/finanzas/facturas-proveedor/${result.id}`);
              }}
            >
              <Button type="submit" variant="outline">
                Nota de débito
              </Button>
            </form>
          ) : null}
          {(isDraft || isIssued) && !isCancelled && (
            <form
              action={async () => {
                "use server";
                const result = isCreditNote
                  ? await cancelCompanySupplierCreditNoteAction(invoiceId)
                  : await cancelCompanySupplierInvoiceAction(invoiceId);
                if ("error" in result) redirectWithActionError(detailPath, result.error);
                redirect(detailPath);
              }}
            >
              <Button type="submit" variant="destructive">
                Anular
              </Button>
            </form>
          )}
        </div>
      ) : null}

      <EntityDocumentsPanel
        scope={{
          kind: "company-finanzas",
          afterUploadPath: `/finanzas/facturas-proveedor/${invoiceId}`,
        }}
        linkedEntity={{ type: "SUPPLIER_INVOICE", id: invoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
