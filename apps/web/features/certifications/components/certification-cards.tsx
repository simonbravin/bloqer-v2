import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { CertificationStatusBadge } from "./certification-status-badge";
import type { CertificationListItem } from "./certification-list";

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
}

export function CertificationCards({
  certifications,
  projectId,
}: {
  certifications: CertificationListItem[];
  projectId: string;
}) {
  if (certifications.length === 0) {
    return (
      <ListEmptyState message="Sin certificaciones. Cree la primera para registrar avance de obra." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {certifications.map((c) => (
        <Link
          key={c.id}
          href={`/proyectos/${projectId}/certificaciones/${c.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
            <CertificationStatusBadge status={c.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatDate(c.periodStart)} — {formatDate(c.periodEnd)}
          </p>
          <p className="mt-3 text-lg font-semibold tabular-nums">
            {fmtMoney(c.totalAmount, c.currency)}
          </p>
        </Link>
      ))}
    </div>
  );
}
