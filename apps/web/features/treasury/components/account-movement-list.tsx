import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { Badge } from "@/components/ui/badge";
import { AccountMovementTypeBadge } from "./account-movement-type-badge";
import type { AccountMovementType, AccountMovementStatus } from "@bloqer/database";
import { formatDate } from "@/lib/format";

export type AccountMovementListItem = {
  id: string;
  movementDate: Date;
  type: AccountMovementType;
  currency: string;
  amount: string;
  description: string | null;
  status: AccountMovementStatus;
};

const OUTFLOW_TYPES: AccountMovementType[] = ["OUTFLOW", "TRANSFER_OUT"];

function fmtMoney(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

interface AccountMovementListProps {
  movements: AccountMovementListItem[];
}

export function AccountMovementList({ movements }: AccountMovementListProps) {
  if (movements.length === 0) {
    return <ListEmptyState message="Sin movimientos registrados." />;
  }

  return (
    <TableScroll>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Moneda</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map((m) => {
          const isOutflow = OUTFLOW_TYPES.includes(m.type);
          return (
            <TableRow key={m.id}>
              <TableCell className="text-sm">{formatDate(m.movementDate)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {m.description ?? "—"}
              </TableCell>
              <TableCell>
                <AccountMovementTypeBadge type={m.type} />
              </TableCell>
              <TableCell className="text-sm">{m.currency}</TableCell>
              <TableCell
                className={`text-right font-mono text-sm${isOutflow ? " text-destructive" : ""}`}
              >
                {isOutflow ? "−" : "+"}{fmtMoney(m.amount)}
              </TableCell>
              <TableCell>
                <Badge variant={m.status === "CONFIRMED" ? "default" : "secondary"}>
                  {m.status === "CONFIRMED" ? "Confirmado" : "Cancelado"}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </TableScroll>
  );
}
