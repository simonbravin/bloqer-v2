"use client";

import type { JournalEntryView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { JournalEntryCards } from "./journal-entry-cards";
import { JournalEntryTable } from "./journal-entry-table";

export function JournalEntryListSection({
  entries,
  empresa,
}: {
  entries: JournalEntryView[];
  empresa?: string;
}) {
  const view = useListViewMode();
  if (view === "cards") return <JournalEntryCards entries={entries} empresa={empresa} />;
  return <JournalEntryTable entries={entries} empresa={empresa} />;
}
