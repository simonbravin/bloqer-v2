import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { SubcontractView } from "@bloqer/services";
import { formatMoneyAmount } from "@/lib/format-money";
import { SubcontractStatusBadge } from "./subcontract-status-badge";

export function SubcontractCards({
  subcontracts,
  projectId,
}: {
  subcontracts: SubcontractView[];
  projectId: string;
}) {
  if (subcontracts.length === 0) {
    return <ListEmptyState message="No hay subcontratos en este proyecto." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {subcontracts.map((s) => (
        <Link
          key={s.id}
          href={`/proyectos/${projectId}/subcontratos/${s.id}`}
          className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{s.code}</span>
            <span className="shrink-0">
              <SubcontractStatusBadge status={s.status} />
            </span>
          </div>
          <h3 className="mt-2 truncate font-semibold leading-snug" title={s.title}>
            {s.title}
          </h3>
          <p className="mt-1 truncate text-sm text-muted-foreground" title={s.subcontractorName}>
            {s.subcontractorName}
          </p>
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">
              {formatMoneyAmount(s.totalValue, s.currency)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
