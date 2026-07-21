import type { CollectionStatus } from "@bloqer/database";

export type CollectionListItem = {
  id: string;
  projectId: string | null;
  collectionDate: Date;
  accountName: string;
  currency: string;
  amount: string;
  notes: string | null;
  status: CollectionStatus;
};
