import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatRelativePast } from "@/lib/format-relative";
import type { FieldPendingItem } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FieldPendingCard({ item }: { item: FieldPendingItem }) {
  const hasDesc = !!item.description;
  const hasMoney = !!(item.amount && item.currency);
  const isOverdue = item.overdueDays > 0;

  return (
    <article
      className={`rounded-lg border bg-card px-4 py-3 ${
        isOverdue ? "border-destructive/60 shadow-[inset_0_0_0_1px_theme(colors.destructive/30%)]" : ""
      }`}
      data-testid="field-pending-card"
      data-entity-type={item.entityType}
      data-overdue={isOverdue ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">
            {item.typeLabel}
          </span>
          <Badge
            variant={item.priority === "stale" ? "outline" : "secondary"}
            className="shrink-0"
          >
            {item.statusLabel}
          </Badge>
          {isOverdue && (
            <Badge variant="destructive" className="shrink-0">
              Vencida {item.overdueDays} d
            </Badge>
          )}
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href={item.href}>{item.actionLabel}</Link>
        </Button>
      </div>

      <p className="mt-1.5 text-sm font-semibold leading-snug">
        {item.title}: {item.projectCode} · {item.projectName}
      </p>

      {(hasDesc || hasMoney) && (
        <p className="mt-0.5 text-sm text-foreground">
          {hasDesc ? item.description : null}
          {hasDesc && hasMoney ? ": " : null}
          {hasMoney ? (
            <span className="font-medium tabular-nums">
              {formatMoneyAmount(item.amount!, item.currency!)}
            </span>
          ) : null}
        </p>
      )}

      <p className="mt-0.5 text-xs text-muted-foreground">
        {item.requestedByName ? `Solicitado por ${item.requestedByName} · ` : ""}
        {formatRelativePast(item.occurredAt)} · {formatDate(item.occurredAt)}
      </p>
    </article>
  );
}
