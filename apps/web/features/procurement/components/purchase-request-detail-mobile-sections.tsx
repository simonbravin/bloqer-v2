import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  formatMoneyAmount,
  formatRatePctFromString,
  formatUnitPriceFromString,
  formatQtyWithUnit,
  isZeroRatePct,
} from "@/lib/format-money";
import { PurchaseRequestStatusBadge } from "./purchase-request-status-badge";
import { ProcurementQuoteStatusBadge } from "./procurement-quote-status-badge";
import { SelectQuoteButton } from "./procurement-quote-form";
import type { PurchaseRequestView } from "@bloqer/services";
import type { ReactNode } from "react";

type QuoteCard = {
  id: string;
  supplierName: string;
  status: string;
  totalAmount: string;
  currency: string;
  leadTimeDays: number | null;
  lines?: Array<{
    purchaseRequestLineId?: string;
    description: string;
    unitPrice: string;
    discountPct: string;
  }>;
};

export function PurchaseRequestDetailMobileSections({
  pr,
  quotes,
  documents,
  projectId,
  canAward = false,
  linkedOrders = [],
}: {
  pr: PurchaseRequestView;
  quotes: QuoteCard[];
  documents: ReactNode;
  projectId: string;
  canAward?: boolean;
  linkedOrders?: Array<{ id: string; code: string; status: string }>;
}) {
  const line = pr.lines[0];
  const wbs =
    line?.wbsNodeCode && line.wbsNodeName
      ? `${line.wbsNodeCode} — ${line.wbsNodeName}`
      : line?.wbsNodeCode ?? null;
  const freeLineIds = new Set(
    pr.lines.filter((l) => !l.awardedPurchaseOrderId).map((l) => l.id),
  );
  const freeLineCount = freeLineIds.size;
  const showAwardShortcut =
    canAward &&
    freeLineCount > 0 &&
    quotes.some(
      (q) =>
        (q.status === "RECEIVED" || q.status === "SELECTED") &&
        (q.lines?.some((l) => l.purchaseRequestLineId && freeLineIds.has(l.purchaseRequestLineId)) ??
          false),
    );

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
        {linkedOrders.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="text-xs text-muted-foreground">
              Cobertura: {pr.lines.length - freeLineCount}/{pr.lines.length} ítems
            </p>
            {linkedOrders.map((po) => (
              <p key={po.id}>
                <Link
                  href={`/proyectos/${projectId}/ordenes-compra/${po.id}`}
                  className="font-medium hover:underline"
                >
                  {po.code}
                </Link>
                <span className="text-muted-foreground"> ({po.status})</span>
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Pedido</h2>
        {pr.lines.map((item) => (
          <div key={item.id} className="space-y-1 rounded-md border p-3">
            <p className="font-medium">{item.description}</p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {formatQtyWithUnit(item.quantity, item.unit)}
            </p>
            {item.awardedPurchaseOrderId ? (
              <p className="text-xs text-muted-foreground">Adjudicado</p>
            ) : null}
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

      {quotes.length > 0 && ["SUBMITTED", "QUOTE_SELECTED"].includes(pr.status) ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Cotizaciones</h2>
          {showAwardShortcut ? (
            <p className="text-xs text-muted-foreground">
              En el celular podés adjudicar todos los ítems libres de una cotización. Para repartir por
              ítem entre proveedores, usá la vista de escritorio.
            </p>
          ) : null}
          {quotes.map((q) => {
            const canQuickAward =
              canAward &&
              (q.status === "RECEIVED" || q.status === "SELECTED") &&
              freeLineCount > 0 &&
              (q.lines?.some(
                (l) => l.purchaseRequestLineId && freeLineIds.has(l.purchaseRequestLineId),
              ) ??
                false);
            return (
              <div key={q.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{q.supplierName}</p>
                  <ProcurementQuoteStatusBadge status={q.status} />
                </div>
                <p className="text-sm tabular-nums">
                  {formatMoneyAmount(q.totalAmount, q.currency)}
                </p>
                {q.lines && q.lines.length > 0 ? (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {q.lines.map((l, i) => (
                      <li key={`${q.id}-${i}`}>
                        {l.description}: {formatUnitPriceFromString(l.unitPrice)} neto
                        {!isZeroRatePct(l.discountPct)
                          ? ` · desc. ${formatRatePctFromString(l.discountPct)}%`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  Plazo {q.leadTimeDays != null ? `${q.leadTimeDays} días` : "—"}
                </p>
                {canQuickAward ? (
                  <SelectQuoteButton
                    quoteId={q.id}
                    projectId={projectId}
                    purchaseRequestId={pr.id}
                  />
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
