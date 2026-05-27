"use client";

import { useSearchParams } from "next/navigation";
import type { InternalTransferView } from "@bloqer/services";
import { InternalTransferCards } from "./internal-transfer-cards";
import { InternalTransferTable } from "./internal-transfer-table";

export function InternalTransferListSection({ transfers }: { transfers: InternalTransferView[] }) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <InternalTransferCards transfers={transfers} />;
  return <InternalTransferTable transfers={transfers} />;
}
