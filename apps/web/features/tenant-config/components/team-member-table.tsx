import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { TenantMemberListRow } from "@bloqer/services";

function membershipStatusLabel(s: string) {
  return s === "ACTIVE" ? "Activo" : "Inactivo";
}

export function TeamMemberTable({ members }: { members: TenantMemberListRow[] }) {
  if (members.length === 0) {
    return <ListEmptyState message="Sin miembros." />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Alta</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((r) => (
            <TableRow key={r.membershipId}>
              <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
              <TableCell>{r.email}</TableCell>
              <TableCell>{membershipStatusLabel(r.status)}</TableCell>
              <TableCell className="text-xs">{r.roles.join(", ")}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
              <TableCell>
                <Button variant="link" className="h-auto p-0" asChild>
                  <Link href={`/configuracion/equipo/${r.membershipId}`}>Detalle</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
