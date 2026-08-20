"use client";

import type { ContactWithRoles } from "@/features/directory/types";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { ContactCards } from "./contact-cards";
import { ContactTable } from "./contact-table";

export function ContactListSection({ contacts }: { contacts: ContactWithRoles[] }) {
  const view = useListViewMode();

  if (view === "cards") return <ContactCards contacts={contacts} />;
  return <ContactTable contacts={contacts} />;
}
