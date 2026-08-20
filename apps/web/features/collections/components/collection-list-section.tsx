"use client";

import type { CollectionListItem } from "./collection-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { CollectionCards } from "./collection-cards";
import { CollectionTable } from "./collection-table";

export function CollectionListSection({
  collections,
  projectId,
}: {
  collections: CollectionListItem[];
  projectId: string;
}) {
  const view = useListViewMode();
  if (view === "cards") return <CollectionCards collections={collections} projectId={projectId} />;
  return <CollectionTable collections={collections} projectId={projectId} />;
}
