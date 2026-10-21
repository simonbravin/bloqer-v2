"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { createPurchaseOrdersFromAwardsAction } from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";
import {
  formatMoneyAmount,
  formatQtyWithUnit,
  formatUnitPriceFromString,
} from "@/lib/format-money";
import { buildPurchaseRequestAwardGroups } from "../lib/purchase-request-award-selection";

type PrLine = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  awardedPurchaseOrderId?: string | null;
};

type QuoteLineCol = {
  purchaseRequestLineId: string;
  unitPrice: string;
  /** Persisted line total after discount + IVA; excludes document-level IIBB. */
  lineTotal: string;
};

type QuoteCol = {
  id: string;
  supplierName: string;
  status: string;
  currency: string;
  lines: QuoteLineCol[];
};

interface Props {
  projectId: string;
  purchaseRequestId: string;
  prLines: PrLine[];
  quotes: QuoteCol[];
  canAward: boolean;
}

/**
 * Matrix: each free PR line → one RECEIVED quote. Batch-creates N OCs in one transaction.
 */
export function PurchaseRequestAwardMatrix({
  projectId,
  purchaseRequestId,
  prLines,
  quotes,
  canAward,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // RECEIVED + SELECTED: after cancelling one covering OC, the still-used quote stays SELECTED
  // while free lines can be re-awarded to that same supplier ([BR-PUR-024]).
  const awardableQuotes = useMemo(
    () => quotes.filter((q) => q.status === "RECEIVED" || q.status === "SELECTED"),
    [quotes],
  );

  const freeLines = useMemo(() => prLines.filter((l) => !l.awardedPurchaseOrderId), [prLines]);

  const [selection, setSelection] = useState<Record<string, string>>({});
  const selectedCount = freeLines.filter((line) => Boolean(selection[line.id])).length;

  if (!canAward || freeLines.length === 0 || awardableQuotes.length === 0) {
    return null;
  }

  function quoteLineFor(quoteId: string, lineId: string): QuoteLineCol | null {
    const q = awardableQuotes.find((x) => x.id === quoteId);
    return q?.lines.find((l) => l.purchaseRequestLineId === lineId) ?? null;
  }

  function onGenerate() {
    setError(null);
    let groups;
    try {
      groups = buildPurchaseRequestAwardGroups(prLines, quotes, selection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revisá los ítems seleccionados.");
      return;
    }

    startTransition(async () => {
      const res = await createPurchaseOrdersFromAwardsAction(projectId, {
        purchaseRequestId,
        groups,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      if (res.purchaseOrderIds.length === 1) {
        router.push(`/proyectos/${projectId}/ordenes-compra/${res.purchaseOrderIds[0]}`);
        return;
      }
      setSelection({});
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Adjudicar por ítem</h3>
          <p className="text-xs text-muted-foreground">
            Elegí los ítems que querés adjudicar ahora. Cada ítem completo va a un solo proveedor;
            los demás quedan pendientes.
          </p>
        </div>
        <Button
          type="button"
          onClick={onGenerate}
          disabled={pending || selectedCount === 0}
          data-testid="award-generate-pos"
        >
          {pending ? "Generando…" : "Generar órdenes seleccionadas"}
        </Button>
      </div>
      <p className="text-sm" aria-live="polite">
        {selectedCount} de {freeLines.length} ítems pendientes seleccionados.
      </p>
      <p className="text-xs text-muted-foreground">
        Precio unitario neto antes del descuento. Total de línea con descuento e IVA; la percepción
        IIBB se calcula por separado en cada orden según la cotización.
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="space-y-3 md:hidden">
        {freeLines.map((line) => {
          const selectedQuote = awardableQuotes.find((q) => q.id === selection[line.id]);
          const selectedLine = selectedQuote ? quoteLineFor(selectedQuote.id, line.id) : null;
          return (
            <div key={line.id} className="space-y-2 rounded-md border p-3">
              <label htmlFor={`award-mobile-${line.id}`} className="block text-sm font-medium">
                {line.description} · {formatQtyWithUnit(line.quantity, line.unit)}
              </label>
              <select
                id={`award-mobile-${line.id}`}
                className="min-h-11 w-full rounded-md border bg-background px-2 text-sm"
                value={selection[line.id] ?? ""}
                disabled={pending}
                onChange={(e) => setSelection((prev) => ({ ...prev, [line.id]: e.target.value }))}
              >
                <option value="">Dejar pendiente</option>
                {awardableQuotes.map((q) => {
                  const ql = quoteLineFor(q.id, line.id);
                  return (
                    <option key={q.id} value={q.id} disabled={!ql}>
                      {q.supplierName}
                      {ql ? ` · ${formatMoneyAmount(ql.lineTotal, q.currency)}` : " · Sin renglón"}
                    </option>
                  );
                })}
              </select>
              {selectedLine && selectedQuote ? (
                <p className="text-xs text-muted-foreground">
                  Unitario neto: {formatUnitPriceFromString(selectedLine.unitPrice)}{" "}
                  {selectedQuote.currency}
                  {" · "}Total línea con IVA:{" "}
                  {formatMoneyAmount(selectedLine.lineTotal, selectedQuote.currency)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="hidden md:block">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ítem</TableHead>
                {awardableQuotes.map((q) => (
                  <TableHead key={q.id} className="text-center min-w-[9rem]">
                    {q.supplierName}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {q.currency} · Unitario neto / Total línea con IVA
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {freeLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <p className="font-medium">{line.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatQtyWithUnit(line.quantity, line.unit)}
                    </p>
                    {selection[line.id] ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        aria-label={`Dejar pendiente: ${line.description}`}
                        onClick={() => setSelection((prev) => ({ ...prev, [line.id]: "" }))}
                      >
                        Dejar pendiente
                      </Button>
                    ) : null}
                  </TableCell>
                  {awardableQuotes.map((q) => {
                    const ql = quoteLineFor(q.id, line.id);
                    const checked = selection[line.id] === q.id;
                    return (
                      <TableCell key={q.id} className="text-center">
                        <label className="inline-flex flex-col items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`award-${line.id}`}
                            aria-label={`${q.supplierName}: ${line.description}`}
                            checked={checked}
                            onChange={() => setSelection((prev) => ({ ...prev, [line.id]: q.id }))}
                            disabled={pending || ql == null}
                          />
                          {ql != null ? (
                            <>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {formatUnitPriceFromString(ql.unitPrice)}
                              </span>
                              <span className="text-xs font-medium tabular-nums">
                                {formatMoneyAmount(ql.lineTotal, q.currency)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs tabular-nums text-muted-foreground">—</span>
                          )}
                        </label>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </div>
    </div>
  );
}
