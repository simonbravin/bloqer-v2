import Link from "next/link";
import type { ReceivableStatus } from "@bloqer/database";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { Button } from "@/components/ui/button";
import { ReceivableStatusBadge } from "./receivable-status-badge";

export type ReceivableFieldCollectionItem = {
  id: string;
  collectionDate: Date;
  amount: string;
  currency: string;
  accountName: string;
  reference: string | null;
  href: string | null;
};

export function ReceivableFieldDetailView({
  clientName,
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
  collections,
  canCollect,
  collectHref,
  collectedBanner,
}: {
  clientName: string;
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
  collections: ReceivableFieldCollectionItem[];
  canCollect: boolean;
  collectHref: string | null;
  collectedBanner: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="receivables-field-detail">
      {collectedBanner ? (
        <p
          className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium"
          data-testid="receivables-field-collected-banner"
        >
          Cobro registrado
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">Cuenta por cobrar</h1>
        <ReceivableStatusBadge status={status as ReceivableStatus} />
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Cliente</p>
          <p className="font-medium">{clientName}</p>
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
            <span className="text-muted-foreground">Total cobrado</span>
            <span className="tabular-nums">{formatMoneyAmount(paidAmount, currency)}</span>
          </div>
          <div className="flex justify-between gap-2 font-semibold">
            <span>Saldo pendiente</span>
            <span className="tabular-nums" data-testid="receivables-field-balance">
              {formatMoneyAmount(balanceDue, currency)}
            </span>
          </div>
        </div>
        {invoiceHref ? (
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={invoiceHref} data-testid="receivables-field-invoice-link">
              Ver factura
            </Link>
          </Button>
        ) : null}
      </div>

      {canCollect && collectHref ? (
        <Button asChild className="min-h-11 w-full" data-testid="receivables-field-register-collect">
          <Link href={collectHref}>Registrar cobro</Link>
        </Button>
      ) : null}

      <section data-testid="receivables-field-collection-history">
        <h2 className="mb-2 text-sm font-semibold">Cobranzas anteriores</h2>
        {collections.length === 0 ? (
          <p className="rounded-lg border bg-card px-4 py-5 text-sm text-muted-foreground">
            Todavía no hay cobranzas registradas.
          </p>
        ) : (
          <ul className="space-y-2">
            {collections.map((c) => {
              const body = (
                <>
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{formatDate(c.collectionDate)}</span>
                    <span className="font-medium tabular-nums">
                      {formatMoneyAmount(c.amount, c.currency)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.accountName}</p>
                  {c.reference ? (
                    <p className="mt-1 text-xs text-muted-foreground">Ref. {c.reference}</p>
                  ) : null}
                </>
              );
              return (
                <li key={c.id}>
                  {c.href ? (
                    <Link
                      href={c.href}
                      className="block rounded-lg border bg-card p-3"
                      data-testid="receivables-field-collection-card"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      className="rounded-lg border bg-card p-3"
                      data-testid="receivables-field-collection-card"
                    >
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
