import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { Button } from "@/components/ui/button";
import { PayableStatusBadge } from "./payable-status-badge";

export type PayableFieldPaymentItem = {
  id: string;
  paymentDate: Date;
  amount: string;
  currency: string;
  accountName: string;
  reference: string | null;
  href: string;
};

export function PayableFieldDetailView({
  supplierName,
  invoiceCode,
  invoiceHref,
  projectName,
  issueDate,
  dueDate,
  currency,
  originalAmount,
  paidAmount,
  balanceDue,
  status,
  payments,
  canPay,
  payHref,
  paidBanner,
}: {
  supplierName: string;
  invoiceCode: string | null;
  invoiceHref: string | null;
  projectName: string | null;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  status: string;
  payments: PayableFieldPaymentItem[];
  canPay: boolean;
  payHref: string | null;
  paidBanner: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="payables-field-detail">
      {paidBanner ? (
        <p
          className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium"
          data-testid="payables-field-paid-banner"
        >
          Pago registrado
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">Cuenta por pagar</h1>
        <PayableStatusBadge status={status} />
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Proveedor</p>
          <p className="font-medium">{supplierName}</p>
        </div>
        {invoiceCode ? (
          <div>
            <p className="text-muted-foreground">Factura</p>
            <p className="font-medium">{invoiceCode}</p>
          </div>
        ) : null}
        {projectName ? (
          <div>
            <p className="text-muted-foreground">Proyecto</p>
            <p className="font-medium">{projectName}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-muted-foreground">Emisión</p>
            <p className="font-medium">{formatDate(issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Vencimiento</p>
            <p className="font-medium">{formatDate(dueDate)}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{currency}</p>
        <hr />
        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Monto original</span>
            <span className="tabular-nums">{formatMoneyAmount(originalAmount, currency)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Total pagado</span>
            <span className="tabular-nums">{formatMoneyAmount(paidAmount, currency)}</span>
          </div>
          <div className="flex justify-between gap-2 font-semibold">
            <span>Saldo pendiente</span>
            <span className="tabular-nums" data-testid="payables-field-balance">
              {formatMoneyAmount(balanceDue, currency)}
            </span>
          </div>
        </div>
        {invoiceHref ? (
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={invoiceHref} data-testid="payables-field-invoice-link">
              Ver factura
            </Link>
          </Button>
        ) : null}
      </div>

      {canPay && payHref ? (
        <Button asChild className="min-h-11 w-full" data-testid="payables-field-register-pay">
          <Link href={payHref}>Registrar pago</Link>
        </Button>
      ) : null}

      <section data-testid="payables-field-payment-history">
        <h2 className="mb-2 text-sm font-semibold">Pagos anteriores</h2>
        {payments.length === 0 ? (
          <p className="rounded-lg border bg-card px-4 py-5 text-sm text-muted-foreground">
            Todavía no hay pagos registrados.
          </p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.href}
                  className="block rounded-lg border bg-card p-3"
                  data-testid="payables-field-payment-card"
                >
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{formatDate(p.paymentDate)}</span>
                    <span className="font-medium tabular-nums">
                      {formatMoneyAmount(p.amount, p.currency)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.accountName}</p>
                  {p.reference ? (
                    <p className="mt-1 text-xs text-muted-foreground">Ref. {p.reference}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
