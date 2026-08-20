"use client";

import type { InternalTransferView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { InternalTransferCards } from "./internal-transfer-cards";
import { InternalTransferTable } from "./internal-transfer-table";

export function InternalTransferListSection({ transfers }: { transfers: InternalTransferView[] }) {
  const view = useListViewMode();
  if (view === "cards") return <InternalTransferCards transfers={transfers} />;
  return <InternalTransferTable transfers={transfers} />;
}
