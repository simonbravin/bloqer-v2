"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleBadge } from "./role-badge";
import type { ContactWithRoles } from "@/features/directory/types";

interface ContactTableProps {
  contacts: ContactWithRoles[];
}

export function ContactTable({ contacts }: ContactTableProps) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        No se encontraron contactos con los filtros aplicados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>CUIT / ID Fiscal</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
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
                <span
                  className={
                    contact.status === "ACTIVE"
                      ? "text-xs font-medium text-green-700"
                      : "text-xs font-medium text-muted-foreground"
                  }
                >
                  {contact.status === "ACTIVE" ? "Activo" : "Archivado"}
                </span>
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
    </div>
  );
}
