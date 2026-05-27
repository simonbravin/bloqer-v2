import type { CollectionStatus } from "@bloqer/database";
import { CollectionTable } from "./collection-table";

export type CollectionListItem = {
  id: string;
  projectId: string;
  collectionDate: Date;
  accountName: string;
  currency: string;
  amount: string;
  notes: string | null;
  status: CollectionStatus;
};

interface CollectionListProps {
  collections: CollectionListItem[];
  projectId: string;
}

/** @deprecated Use CollectionTable or CollectionListSection */
export function CollectionList({ collections, projectId }: CollectionListProps) {
  return <CollectionTable collections={collections} projectId={projectId} />;
}
