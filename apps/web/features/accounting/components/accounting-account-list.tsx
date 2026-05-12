import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AccountingAccount } from "@bloqer/database";
import { AccountTypeBadge } from "./account-type-badge";

export type AccountingAccountListItem = Pick<
  AccountingAccount,
  "id" | "code" | "name" | "type" | "isActive"
>;

export function AccountingAccountList({
  accounts,
  empresa,
}: {
  accounts: AccountingAccountListItem[];
  empresa?: string;
}) {
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";
  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay cuentas contables.</p>;
  }
  return (
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
              <Link className="text-primary underline-offset-4 hover:underline" href={`/contabilidad/cuentas/${a.id}${q}`}>
                {a.code}
              </Link>
            </TableCell>
            <TableCell>{a.name}</TableCell>
            <TableCell><AccountTypeBadge type={a.type} /></TableCell>
            <TableCell className="text-muted-foreground text-sm">{a.isActive ? "Activa" : "Inactiva"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
