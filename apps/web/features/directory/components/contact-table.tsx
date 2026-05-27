"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TableScroll } from "@/components/ui/table-scroll";
import { useClientTableSort } from "@/hooks/use-client-table-sort";
import { RoleBadge } from "./role-badge";
import { ContactStatusBadge } from "./contact-status-badge";
import type { ContactWithRoles } from "@/features/directory/types";

interface ContactTableProps {
  contacts: ContactWithRoles[];
}

export function ContactTable({ contacts }: ContactTableProps) {
  const accessors = useMemo(
    () => ({
      name: (c: ContactWithRoles) => c.legalName,
      taxId: (c: ContactWithRoles) => c.taxId ?? "",
      email: (c: ContactWithRoles) => c.email ?? "",
      status: (c: ContactWithRoles) => c.status,
    }),
    [],
  );

  const { sorted, sortKey, sortDir, toggleSort } = useClientTableSort(contacts, accessors, "name");

  if (contacts.length === 0) {
    return <ListEmptyState message="No se encontraron contactos con los filtros aplicados." />;
  }

  return (
    <TableScroll className="border-0">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Nombre" sortKey="name" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTableHead label="CUIT / ID Fiscal" sortKey="taxId" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <TableHead>Roles</TableHead>
            <SortableTableHead label="Email" sortKey="email" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTableHead label="Estado" sortKey="status" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((contact) => (
            <TableRow key={contact.id}>
              <TableCell>
                <div className="font-medium">{contact.legalName}</div>
                {contact.fantasyName && (
                  <div className="text-xs text-muted-foreground">{contact.fantasyName}</div>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {contact.taxId ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {contact.roles.map((r) => (
                    <RoleBadge key={r.id} role={r.role} />
                  ))}
                  {contact.roles.length === 0 && (
                    <span className="text-xs text-muted-foreground">Sin roles</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {contact.email ?? "—"}
              </TableCell>
              <TableCell>
                <ContactStatusBadge status={contact.status} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/directorio/${contact.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
