import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { PurchaseRequestStatusBadge } from "./purchase-request-status-badge";
import { ProcurementQuoteStatusBadge } from "./procurement-quote-status-badge";
import type { PurchaseRequestView } from "@bloqer/services";
import type { ReactNode } from "react";

type QuoteCard = {
  id: string;
  supplierName: string;
  status: string;
  totalAmount: string;
  currency: string;
  leadTimeDays: number | null;
};

export function PurchaseRequestDetailMobileSections({
  pr,
  quotes,
  documents,
}: {
  pr: PurchaseRequestView;
  quotes: QuoteCard[];
  documents: ReactNode;
}) {
  const line = pr.lines[0];
  const wbs =
    line?.wbsNodeCode && line.wbsNodeName
      ? `${line.wbsNodeCode} — ${line.wbsNodeName}`
      : line?.wbsNodeCode ?? null;

  return (
    <div className="space-y-4 md:hidden">
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Resumen</h2>
        <div className="flex items-center gap-2">
          <PurchaseRequestStatusBadge status={pr.status} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Solicitante</dt>
            <dd>{pr.requestedByName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fecha</dt>
            <dd>{formatDate(pr.createdAt)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Fecha requerida</dt>
            <dd>{pr.neededByDate ? formatDate(pr.neededByDate) : "—"}</dd>
          </div>
        </dl>
        {pr.notes ? <p className="text-sm text-muted-foreground">{pr.notes}</p> : null}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Pedido</h2>
        {pr.lines.map((item) => (
          <div key={item.id} className="space-y-1 rounded-md border p-3">
            <p className="font-medium">{item.description}</p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {item.quantity} {item.unit}
            </p>
            {item.wbsNodeCode ? (
              <p className="text-sm text-muted-foreground">
                {item.wbsNodeName ? `${item.wbsNodeCode} — ${item.wbsNodeName}` : item.wbsNodeCode}
              </p>
            ) : wbs ? (
              <p className="text-sm text-muted-foreground">{wbs}</p>
            ) : null}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Evidencia</h2>
        {documents}
      </section>

      {quotes.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Cotizaciones</h2>
          {quotes.map((q) => (
            <div key={q.id} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{q.supplierName}</p>
                <ProcurementQuoteStatusBadge status={q.status} />
              </div>
              <p className="text-sm tabular-nums">
                {formatMoneyAmount(q.totalAmount, q.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                Plazo {q.leadTimeDays != null ? `${q.leadTimeDays} días` : "—"}
              </p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function PurchaseRequestLinkedPoBanner({
  href,
  code,
  status,
}: {
  href: string;
  code: string;
  status: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <span className="text-muted-foreground">Orden de compra vinculada: </span>
      <Link href={href} className="font-medium hover:underline">
        {code}
      </Link>
      <span className="text-muted-foreground"> ({status})</span>
    </div>
  );
}
