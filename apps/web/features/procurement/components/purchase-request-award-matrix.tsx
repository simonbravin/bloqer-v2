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
import { formatUnitPriceFromString } from "@/lib/format-money";

type PrLine = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  awardedPurchaseOrderId?: string | null;
};

type QuoteCol = {
  id: string;
  supplierName: string;
  status: string;
  currency: string;
  lines: Array<{
    purchaseRequestLineId: string;
    unitPrice: string;
  }>;
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

  const freeLines = useMemo(
    () => prLines.filter((l) => !l.awardedPurchaseOrderId),
    [prLines],
  );

  const [selection, setSelection] = useState<Record<string, string>>({});

  if (!canAward || freeLines.length === 0 || awardableQuotes.length === 0) {
    return null;
  }

  function priceFor(quoteId: string, lineId: string): string | null {
    const q = awardableQuotes.find((x) => x.id === quoteId);
    const line = q?.lines.find((l) => l.purchaseRequestLineId === lineId);
    return line?.unitPrice ?? null;
  }

  function onGenerate() {
    setError(null);
    const groupsMap = new Map<string, string[]>();
    for (const line of freeLines) {
      const quoteId = selection[line.id];
      if (!quoteId) {
        setError("Asigná un proveedor a cada ítem pendiente");
        return;
      }
      const list = groupsMap.get(quoteId) ?? [];
      list.push(line.id);
      groupsMap.set(quoteId, list);
    }
    const groups = [...groupsMap.entries()].map(([procurementQuoteId, purchaseRequestLineIds]) => ({
      procurementQuoteId,
      purchaseRequestLineIds,
    }));

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
      router.refresh();
    });
  }

  return (
    <div className="hidden md:block space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Adjudicar por ítem</h3>
          <p className="text-xs text-muted-foreground">
            Cada ítem completo va a un solo proveedor. Generá una o más órdenes en un paso.
          </p>
        </div>
        <Button type="button" onClick={onGenerate} disabled={pending} data-testid="award-generate-pos">
          {pending ? "Generando…" : "Generar órdenes"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ítem</TableHead>
              {awardableQuotes.map((q) => (
                <TableHead key={q.id} className="text-center min-w-[8rem]">
                  {q.supplierName}
                  <span className="block text-xs font-normal text-muted-foreground">{q.currency}</span>
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
                    {line.quantity} {line.unit}
                  </p>
                </TableCell>
                {awardableQuotes.map((q) => {
                  const price = priceFor(q.id, line.id);
                  const checked = selection[line.id] === q.id;
                  return (
                    <TableCell key={q.id} className="text-center">
                      <label className="inline-flex flex-col items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`award-${line.id}`}
                          checked={checked}
                          onChange={() =>
                            setSelection((prev) => ({ ...prev, [line.id]: q.id }))
                          }
                          disabled={pending || price == null}
                        />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {price != null ? formatUnitPriceFromString(price) : "—"}
                        </span>
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
  );
}
