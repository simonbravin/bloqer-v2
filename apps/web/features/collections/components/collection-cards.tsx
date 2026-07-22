import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { CollectionStatusBadge } from "./collection-status-badge";
import type { CollectionListItem } from "./collection-list";
import { formatMoneyAmount } from "@/lib/format-money";

export function CollectionCards({
  collections,
  projectId,
}: {
  collections: CollectionListItem[];
  projectId: string;
}) {
  if (collections.length === 0) {
    return <ListEmptyState message="Sin cobranzas registradas para este proyecto." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {collections.map((c) => (
        <Link
          key={c.id}
          href={`/proyectos/${projectId}/cobranzas/${c.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(c.collectionDate)}</span>
            <CollectionStatusBadge status={c.status} />
          </div>
          <h3 className="mt-2 font-semibold leading-snug">{c.accountName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{c.notes ?? "Sin notas"}</p>
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Monto</span>
            <span className="font-medium">
              {formatMoneyAmount(c.amount)} {c.currency}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
