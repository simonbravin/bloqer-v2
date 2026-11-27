import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatRelativePast } from "@/lib/format-relative";
import type { FieldPendingItem } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FieldPendingCard({ item, compact = false }: { item: FieldPendingItem; compact?: boolean }) {
  const hasDesc = !!item.description;
  const hasMoney = !!(item.amount && item.currency);
  const isOverdue = item.overdueDays > 0;

  if (compact) return (
    <article className={`grid gap-2 rounded-lg border bg-card px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center ${isOverdue ? "border-l-4 border-l-destructive" : ""}`}
      data-testid="field-pending-card" data-entity-type={item.entityType} data-overdue={String(isOverdue)}>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{item.title} <span className="font-normal text-muted-foreground">· {item.projectCode}</span></p>
        <p className="break-words text-xs text-muted-foreground">{item.description ?? item.typeLabel}</p>
        <p className="text-xs text-muted-foreground">{item.requestedByName ?? "Sin solicitante registrado"} · {formatDate(item.occurredAt)}</p>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-xs">{item.statusLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          {isOverdue && <Badge variant="destructive">Vencida {item.overdueDays} d</Badge>}
          {hasMoney && <span className="text-xs font-medium tabular-nums">{formatMoneyAmount(item.amount!, item.currency!)}</span>}
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="min-h-11"><Link href={item.href}>{item.actionLabel}</Link></Button>
    </article>
  );

  return (
    <article
      className={`rounded-lg border bg-card px-4 py-3 ${
        isOverdue ? "border-destructive/60 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.3)]" : ""
      }`}
      data-testid="field-pending-card"
      data-entity-type={item.entityType}
      data-overdue={isOverdue ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <Button asChild size="sm" className="min-h-11 shrink-0">
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
