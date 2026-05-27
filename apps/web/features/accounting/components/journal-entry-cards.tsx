import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { JournalEntryView } from "@bloqer/services";
import { JournalEntryStatusBadge } from "./journal-entry-status-badge";

export function JournalEntryCards({
  entries,
  empresa,
}: {
  entries: JournalEntryView[];
  empresa?: string;
}) {
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";

  if (entries.length === 0) {
    return <ListEmptyState message="No hay asientos." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((e) => (
        <Link
          key={e.id}
          href={`/contabilidad/asientos/${e.id}${q}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {formatDate(e.entryDate)}
            </span>
            <JournalEntryStatusBadge status={e.status} />
          </div>
          <p className="mt-2 line-clamp-2 font-medium leading-snug">{e.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">{e.lines.length} líneas</p>
        </Link>
      ))}
    </div>
  );
}
