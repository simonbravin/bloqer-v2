"use client";

import { useSearchParams } from "next/navigation";
import type { ContactWithRoles } from "@/features/directory/types";
import { ContactCards } from "./contact-cards";
import { ContactTable } from "./contact-table";

export function ContactListSection({ contacts }: { contacts: ContactWithRoles[] }) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "cards" ? "cards" : "table";

  if (view === "cards") return <ContactCards contacts={contacts} />;
  return <ContactTable contacts={contacts} />;
}
