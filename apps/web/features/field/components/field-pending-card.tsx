import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatRelativePast } from "@/lib/format-relative";
import type { FieldPendingItem } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FieldPendingCard({ item }: { item: FieldPendingItem }) {
  return (
    <article
      className="space-y-2 rounded-lg border bg-card p-4"
      data-testid="field-pending-card"
      data-entity-type={item.entityType}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">{item.typeLabel}</p>
        <Badge variant={item.priority === "stale" ? "outline" : "secondary"}>{item.statusLabel}</Badge>
      </div>
      <h3 className="text-base font-semibold">{item.title}</h3>
      <p className="text-sm text-muted-foreground">
        {item.projectCode} · {item.projectName}
      </p>
      {item.description ? <p className="text-sm">{item.description}</p> : null}
      {item.amount && item.currency ? (
        <p className="text-sm font-medium tabular-nums">{formatMoneyAmount(item.amount, item.currency)}</p>
      ) : null}
      {item.requestedByName ? (
        <p className="text-xs text-muted-foreground">Solicitado por {item.requestedByName}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {formatRelativePast(item.occurredAt)}
        {item.occurredAt ? ` · ${formatDate(item.occurredAt)}` : ""}
      </p>
      <Button asChild className="min-h-11 w-full">
        <Link href={item.href}>Revisar</Link>
      </Button>
    </article>
  );
}
