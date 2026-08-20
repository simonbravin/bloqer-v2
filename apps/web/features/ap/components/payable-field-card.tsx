"use client";

import Link from "next/link";
import type { PayablesFieldRow } from "@bloqer/services/payables-field";
import {
  PAYABLES_FIELD_URGENCY_LABELS,
  payablesFieldTodayIso,
  payablesFieldUrgency,
} from "@bloqer/services/payables-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PayableStatusBadge } from "./payable-status-badge";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function urgencyBadgeVariant(
  urgency: ReturnType<typeof payablesFieldUrgency>,
): "destructive" | "default" | "secondary" | "outline" {
  if (urgency === "overdue") return "destructive";
  if (urgency === "due_today") return "default";
  if (urgency === "paid") return "outline";
  return "secondary";
}

export function PayableFieldCard({
  row,
  hrefPrefix,
}: {
  row: PayablesFieldRow;
  hrefPrefix: string;
}) {
  const todayIso = payablesFieldTodayIso();
  const urgency = payablesFieldUrgency(row, todayIso);
  const detailHref = `${hrefPrefix}/${row.id}`;

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-4",
        urgency === "overdue" && "border-destructive/40",
      )}
      data-testid="payables-field-card"
      data-payable-id={row.id}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug">{row.supplierName}</h3>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <Badge variant={urgencyBadgeVariant(urgency)} data-testid="payables-field-urgency">
            {PAYABLES_FIELD_URGENCY_LABELS[urgency]}
          </Badge>
          <PayableStatusBadge status={row.status} />
        </div>
      </div>
      {row.supplierInvoiceCode ? (
        <p className="mt-1 text-xs text-muted-foreground">{row.supplierInvoiceCode}</p>
      ) : null}
      {row.projectName ? (
        <p className="mt-1 text-xs text-muted-foreground">{row.projectName}</p>
      ) : null}
      <p className="mt-2 text-sm">Vence {formatDate(row.dueDateIso)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Total</dt>
        <dd className="text-right tabular-nums">{formatMoneyAmount(row.originalAmount, row.currency)}</dd>
        <dt className="text-muted-foreground">Pagado</dt>
        <dd className="text-right tabular-nums">{formatMoneyAmount(row.paidAmount, row.currency)}</dd>
        <dt className="font-medium">Saldo</dt>
        <dd className="text-right font-semibold tabular-nums">
          {formatMoneyAmount(row.balanceDue, row.currency)}
        </dd>
      </dl>
      <p className="mt-1 text-xs text-muted-foreground">{row.currency}</p>
      <Button asChild variant="outline" className="mt-4 min-h-11 w-full" data-testid="payables-field-card-open">
        <Link href={detailHref}>Ver cuenta</Link>
      </Button>
    </article>
  );
}
