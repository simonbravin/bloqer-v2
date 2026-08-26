import { formatDate } from "@/lib/format";
import { formatMoneyAmount, formatQtyFromString, formatRatePctFromString, formatUnitPriceFromString, isZeroRatePct } from "@/lib/format-money";
import { PurchaseOrderVarianceReadout } from "./purchase-order-variance-readout";
import type { PurchaseOrderView } from "@bloqer/services";
import type { ReactNode } from "react";

function uniqueWbs(order: PurchaseOrderView): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const line of order.lines) {
    const label = line.wbsNodeCode
      ? line.wbsNodeName
        ? `${line.wbsNodeCode} — ${line.wbsNodeName}`
        : line.wbsNodeCode
      : null;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function PurchaseOrderMobileFiche({
  order,
  projectCode,
  projectName,
  documents,
}: {
  order: PurchaseOrderView;
  projectCode: string;
  projectName: string;
  documents: ReactNode;
}) {
  const wbs = uniqueWbs(order);
  const requester = order.originRequestedByName ?? order.createdByName;

  return (
    <div className="space-y-4 md:hidden">
      <section className="rounded-lg border bg-card p-4 space-y-3" data-testid="po-mobile-fiche">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Proyecto</dt>
            <dd>
              {projectCode} — {projectName}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Proveedor</dt>
            <dd className="font-medium">{order.supplierName}</dd>
          </div>
          {requester ? (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Solicitante</dt>
              <dd>{requester}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatMoneyAmount(order.totalAmount, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Moneda</dt>
            <dd>{order.currency}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fecha</dt>
            <dd>{formatDate(order.issueDate)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Control</h2>
        <p className="text-sm">
          {order.lines.length === 1 ? "1 línea" : `${order.lines.length} líneas`}
        </p>
        {wbs.length > 0 ? (
          <div>
            <p className="text-xs text-muted-foreground">Partidas EDT</p>
            <ul className="mt-1 space-y-1 text-sm">
              {wbs.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {order.emergencyReason ? (
          <div>
            <p className="text-xs text-muted-foreground">Motivo de emergencia</p>
            <p className="text-sm">{order.emergencyReason}</p>
          </div>
        ) : null}
        {order.notes ? (
          <div>
            <p className="text-xs text-muted-foreground">Notas</p>
            <p className="text-sm">{order.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Líneas</h2>
        {order.lines.map((line) => (
          <article key={line.id} className="rounded-lg border bg-card p-4 space-y-2" data-testid="po-line-card">
            <p className="font-medium leading-snug">{line.description}</p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {formatQtyFromString(line.quantity)} × {formatUnitPriceFromString(line.unitPrice)}
              {!isZeroRatePct(line.discountPct)
                ? ` · desc. ${formatRatePctFromString(line.discountPct)}%`
                : ""}
            </p>
            <p className="text-sm font-semibold tabular-nums">{formatMoneyAmount(line.lineTotal)}</p>
            {line.wbsNodeCode ? (
              <p className="text-sm text-muted-foreground">
                {line.wbsNodeName ? `${line.wbsNodeCode} — ${line.wbsNodeName}` : line.wbsNodeCode}
              </p>
            ) : null}
            {line.budgetUnitCostSnapshot ? (
              <p className="text-xs text-muted-foreground">
                Ref. {formatUnitPriceFromString(line.budgetUnitCostSnapshot)}
              </p>
            ) : null}
            <PurchaseOrderVarianceReadout
              variancePct={line.variancePct}
              varianceTier={line.varianceTier}
              justification={line.varianceJustification}
              compact
            />
          </article>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Documentos</h2>
        {documents}
      </section>
    </div>
  );
}
