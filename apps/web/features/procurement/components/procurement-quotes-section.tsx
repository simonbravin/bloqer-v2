"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { ProcurementQuoteStatusBadge } from "./procurement-quote-status-badge";
import {
  ProcurementQuoteForm,
  ProcurementQuoteRowActions,
  SelectQuoteButton,
  type ProcurementQuoteEditValues,
} from "./procurement-quote-form";
import type { SupplierOption } from "./purchase-order-form";
import { formatMoneyAmount, formatRatePctFromString, formatUnitPriceFromString, isZeroRatePct } from "@/lib/format-money";

type PrLine = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  budgetUnitCostSnapshot?: string | null;
  awardedPurchaseOrderId?: string | null;
};

type QuoteRow = {
  id: string;
  supplierName: string;
  status: string;
  totalAmount: string;
  currency: string;
  validUntil: string | null;
  leadTimeDays: number | null;
  lines: Array<{
    purchaseRequestLineId: string;
    description: string;
    unitPrice: string;
    taxRate: string;
    discountPct: string;
  }>;
};

interface Props {
  projectId: string;
  purchaseRequestId: string;
  prLines: PrLine[];
  suppliers: SupplierOption[];
  quotes: QuoteRow[];
  canQuote: boolean;
  /** New quotes only while SC is SUBMITTED (service gate). */
  allowCreateQuotes?: boolean;
  /** Quotes referenced by an active OC — no edit/delete ([BR-PUR-024]). */
  frozenQuoteIds?: string[];
}

export function ProcurementQuotesSection({
  projectId,
  purchaseRequestId,
  prLines,
  suppliers,
  quotes,
  canQuote,
  allowCreateQuotes = true,
  frozenQuoteIds = [],
}: Props) {
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const frozen = new Set(frozenQuoteIds);
  const freeLineIds = new Set(
    prLines.filter((l) => !l.awardedPurchaseOrderId).map((l) => l.id),
  );

  const editingQuote = quotes.find((q) => q.id === editingQuoteId);
  const editValues: ProcurementQuoteEditValues | undefined = editingQuote
    ? {
        quoteId: editingQuote.id,
        supplierName: editingQuote.supplierName,
        validUntil: editingQuote.validUntil,
        leadTimeDays: editingQuote.leadTimeDays,
        lines: editingQuote.lines.map((l) => ({
          purchaseRequestLineId: l.purchaseRequestLineId,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
          discountPct: l.discountPct,
        })),
      }
    : undefined;

  return (
    <div className="hidden md:block space-y-4">
      <h2 className="text-lg font-semibold">Cotizaciones</h2>
      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Plazo (días)</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Sin cotizaciones cargadas.
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <p>{q.supplierName}</p>
                    {q.lines.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {q.lines.map((l, i) => (
                          <li key={`${q.id}-${i}`}>
                            {l.description}: {formatUnitPriceFromString(l.unitPrice)} neto · IVA {formatRatePctFromString(l.taxRate)}%
                            {!isZeroRatePct(l.discountPct)
                              ? ` · desc. ${formatRatePctFromString(l.discountPct)}%`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <ProcurementQuoteStatusBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoneyAmount(q.totalAmount, q.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q.leadTimeDays ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {q.validUntil ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {(q.status === "RECEIVED" || q.status === "SELECTED") && canQuote ? (
                      <div className="flex flex-col items-end gap-1">
                        {q.lines.some((l) => freeLineIds.has(l.purchaseRequestLineId)) ? (
                          <SelectQuoteButton
                            quoteId={q.id}
                            projectId={projectId}
                            purchaseRequestId={purchaseRequestId}
                          />
                        ) : null}
                        {q.status === "RECEIVED" && !frozen.has(q.id) ? (
                          <ProcurementQuoteRowActions
                            quoteId={q.id}
                            projectId={projectId}
                            purchaseRequestId={purchaseRequestId}
                            canManage={canQuote}
                            onEdit={() => setEditingQuoteId(q.id)}
                            onDeleted={() => {
                              if (editingQuoteId === q.id) setEditingQuoteId(null);
                            }}
                          />
                        ) : !q.lines.some((l) => freeLineIds.has(l.purchaseRequestLineId)) &&
                          (frozen.has(q.id) || q.status === "SELECTED") ? (
                          <p className="text-xs text-muted-foreground">En uso por OC</p>
                        ) : frozen.has(q.id) || q.status === "SELECTED" ? (
                          <p className="text-xs text-muted-foreground">No editable (OC activa)</p>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableScroll>

      {canQuote && editingQuote && editValues ? (
        <ProcurementQuoteForm
          key={editValues.quoteId}
          projectId={projectId}
          purchaseRequestId={purchaseRequestId}
          suppliers={suppliers}
          lines={prLines}
          mode="edit"
          editValues={editValues}
          onCancelEdit={() => setEditingQuoteId(null)}
        />
      ) : null}

      {allowCreateQuotes && canQuote && !editingQuoteId && suppliers.length > 0 ? (
        <ProcurementQuoteForm
          projectId={projectId}
          purchaseRequestId={purchaseRequestId}
          suppliers={suppliers}
          lines={prLines}
        />
      ) : null}

      {allowCreateQuotes && canQuote && !editingQuoteId && suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay proveedores activos para cargar cotizaciones.
        </p>
      ) : null}
    </div>
  );
}

export type { PrLine, QuoteRow };
