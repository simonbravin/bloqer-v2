"use client";

import Link from "next/link";
import type { ReceivableStatus } from "@bloqer/database";
import type { ReceivablesFieldRow } from "@bloqer/services/receivables-field";
import {
  RECEIVABLES_FIELD_URGENCY_LABELS,
  receivableFieldDetailHref,
  receivablesFieldTodayIso,
  receivablesFieldUrgency,
} from "@bloqer/services/receivables-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReceivableStatusBadge } from "./receivable-status-badge";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function urgencyBadgeVariant(
  urgency: ReturnType<typeof receivablesFieldUrgency>,
): "destructive" | "default" | "secondary" | "outline" {
  if (urgency === "overdue") return "destructive";
  if (urgency === "due_today") return "default";
  if (urgency === "paid") return "outline";
  return "secondary";
}

export function ReceivableFieldCard({ row }: { row: ReceivablesFieldRow }) {
  const todayIso = receivablesFieldTodayIso();
  const urgency = receivablesFieldUrgency(row, todayIso);
  const detailHref = receivableFieldDetailHref(row);

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-4",
        urgency === "overdue" && "border-destructive/40",
      )}
      data-testid="receivables-field-card"
      data-receivable-id={row.id}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug">{row.clientName}</h3>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <Badge variant={urgencyBadgeVariant(urgency)} data-testid="receivables-field-urgency">
            {RECEIVABLES_FIELD_URGENCY_LABELS[urgency]}
          </Badge>
          <ReceivableStatusBadge status={row.status as ReceivableStatus} />
        </div>
      </div>
      {row.salesInvoiceCode ? (
        <p className="mt-1 text-xs text-muted-foreground">{row.salesInvoiceCode}</p>
      ) : null}
      {row.projectName ? (
        <p className="mt-1 text-xs text-muted-foreground">{row.projectName}</p>
      ) : null}
      <p className="mt-2 text-sm">Vence {formatDate(row.dueDateIso)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Monto original</dt>
        <dd className="text-right tabular-nums">{formatMoneyAmount(row.originalAmount, row.currency)}</dd>
        <dt className="text-muted-foreground">Cobrado</dt>
        <dd className="text-right tabular-nums">{formatMoneyAmount(row.paidAmount, row.currency)}</dd>
        <dt className="font-medium">Saldo</dt>
        <dd className="text-right font-semibold tabular-nums">
          {formatMoneyAmount(row.balanceDue, row.currency)}
        </dd>
      </dl>
      <p className="mt-1 text-xs text-muted-foreground">{row.currency}</p>
      <Button asChild variant="outline" className="mt-4 min-h-11 w-full" data-testid="receivables-field-card-open">
        <Link href={detailHref}>Ver cuenta</Link>
      </Button>
    </article>
  );
}
