"use client";

import { useSearchParams } from "next/navigation";
import type { SubcontractView } from "@bloqer/services";
import { SubcontractCards } from "./subcontract-cards";
import { SubcontractTable } from "./subcontract-table";

export function SubcontractListSection({
  subcontracts,
  projectId,
}: {
  subcontracts: SubcontractView[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") {
    return <SubcontractCards subcontracts={subcontracts} projectId={projectId} />;
  }
  return <SubcontractTable subcontracts={subcontracts} projectId={projectId} />;
}
