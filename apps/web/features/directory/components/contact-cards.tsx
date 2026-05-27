"use client";

import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { RoleBadge } from "./role-badge";
import { ContactStatusBadge } from "./contact-status-badge";
import type { ContactWithRoles } from "@/features/directory/types";

interface ContactCardsProps {
  contacts: ContactWithRoles[];
}

export function ContactCards({ contacts }: ContactCardsProps) {
  if (contacts.length === 0) {
    return <ListEmptyState message="No se encontraron contactos con los filtros aplicados." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {contacts.map((contact) => (
        <Link
          key={contact.id}
          href={`/directorio/${contact.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{contact.legalName}</h3>
              {contact.fantasyName ? (
                <p className="truncate text-sm text-muted-foreground">{contact.fantasyName}</p>
              ) : null}
            </div>
            <ContactStatusBadge status={contact.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{contact.taxId ?? "—"}</p>
          {contact.email ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">{contact.email}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1">
            {contact.roles.map((r) => (
              <RoleBadge key={r.id} role={r.role} />
            ))}
            {contact.roles.length === 0 ? (
              <span className="text-xs text-muted-foreground">Sin roles</span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
