"use client";

import type { ContactWithRoles } from "@/features/directory/types";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { ContactCards } from "./contact-cards";
import { ContactTable } from "./contact-table";
import { ContactListEmpty } from "./contact-list-empty";

export function ContactListSection({
  contacts,
  hasActiveFilters = false,
  canCreate,
}: {
  contacts: ContactWithRoles[];
  hasActiveFilters?: boolean;
  canCreate: boolean;
}) {
  const view = useListViewMode();

  if (contacts.length === 0) {
    return <ContactListEmpty hasActiveFilters={hasActiveFilters} canCreate={canCreate} />;
  }

  if (view === "cards") return <ContactCards contacts={contacts} />;
  return <ContactTable contacts={contacts} />;
}
