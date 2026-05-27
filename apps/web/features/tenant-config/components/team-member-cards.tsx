import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { TenantMemberListRow } from "@bloqer/services";

function membershipStatusLabel(s: string) {
  return s === "ACTIVE" ? "Activo" : "Inactivo";
}

export function TeamMemberCards({ members }: { members: TenantMemberListRow[] }) {
  if (members.length === 0) {
    return <ListEmptyState message="Sin miembros." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {members.map((r) => (
        <Link
          key={r.membershipId}
          href={`/configuracion/equipo/${r.membershipId}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">{membershipStatusLabel(r.status)}</span>
            <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
          </div>
          <h3 className="mt-2 font-semibold leading-snug">{r.name ?? r.email}</h3>
          {r.name ? <p className="mt-1 text-sm text-muted-foreground">{r.email}</p> : null}
          <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{r.roles.join(", ")}</p>
        </Link>
      ))}
    </div>
  );
}
