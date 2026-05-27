"use client";

import { useSearchParams } from "next/navigation";
import type { CollectionListItem } from "./collection-list";
import { CollectionCards } from "./collection-cards";
import { CollectionTable } from "./collection-table";

export function CollectionListSection({
  collections,
  projectId,
}: {
  collections: CollectionListItem[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <CollectionCards collections={collections} projectId={projectId} />;
  return <CollectionTable collections={collections} projectId={projectId} />;
}
