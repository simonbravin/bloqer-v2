"use client";

import { useSearchParams } from "next/navigation";
import type { JournalEntryView } from "@bloqer/services";
import { JournalEntryCards } from "./journal-entry-cards";
import { JournalEntryList } from "./journal-entry-list";

export function JournalEntryListSection({
  entries,
  empresa,
}: {
  entries: JournalEntryView[];
  empresa?: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <JournalEntryCards entries={entries} empresa={empresa} />;
  return <JournalEntryList entries={entries} empresa={empresa} />;
}
