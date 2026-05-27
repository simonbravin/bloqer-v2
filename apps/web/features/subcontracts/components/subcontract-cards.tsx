import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { SubcontractView } from "@bloqer/services";
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
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
            <SubcontractStatusBadge status={s.status} />
          </div>
          <h3 className="mt-2 line-clamp-2 font-semibold leading-snug">{s.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{s.subcontractorName}</p>
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">
              {parseFloat(s.totalValue).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
