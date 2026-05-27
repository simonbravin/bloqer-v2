import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { AccountTypeBadge } from "./account-type-badge";
import type { AccountingAccountListItem } from "./accounting-account-list";

export function AccountingAccountTable({
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
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono text-sm">
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/contabilidad/cuentas/${a.id}${q}`}
                >
                  {a.code}
                </Link>
              </TableCell>
              <TableCell>{a.name}</TableCell>
              <TableCell>
                <AccountTypeBadge type={a.type} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {a.isActive ? "Activa" : "Inactiva"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
