import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { AccountTypeBadge } from "./account-type-badge";
import type { AccountingAccountListItem } from "./accounting-account-list";

export function AccountingAccountCards({
  accounts,
  empresa,
}: {
  accounts: AccountingAccountListItem[];
  empresa?: string;
}) {
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";

  if (accounts.length === 0) {
    return <ListEmptyState message="No hay cuentas contables." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {accounts.map((a) => (
        <Link
          key={a.id}
          href={`/contabilidad/cuentas/${a.id}${q}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
            <AccountTypeBadge type={a.type} />
          </div>
          <h3 className="mt-2 line-clamp-2 font-semibold leading-snug">{a.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground">{a.isActive ? "Activa" : "Inactiva"}</p>
        </Link>
      ))}
    </div>
  );
}
