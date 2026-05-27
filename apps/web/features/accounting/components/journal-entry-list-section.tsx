"use client";

import { useSearchParams } from "next/navigation";
import type { JournalEntryView } from "@bloqer/services";
import { JournalEntryCards } from "./journal-entry-cards";
import { JournalEntryTable } from "./journal-entry-table";

export function JournalEntryListSection({
  entries,
  empresa,
}: {
  entries: JournalEntryView[];
  empresa?: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <JournalEntryCards entries={entries} empresa={empresa} />;
  return <JournalEntryTable entries={entries} empresa={empresa} />;
}
