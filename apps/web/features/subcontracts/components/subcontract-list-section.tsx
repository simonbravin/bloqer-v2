"use client";

import type { SubcontractView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { SubcontractCards } from "./subcontract-cards";
import { SubcontractTable } from "./subcontract-table";

export function SubcontractListSection({
  subcontracts,
  projectId,
}: {
  subcontracts: SubcontractView[];
  projectId: string;
}) {
  const view = useListViewMode();
  if (view === "cards") {
    return <SubcontractCards subcontracts={subcontracts} projectId={projectId} />;
  }
  return <SubcontractTable subcontracts={subcontracts} projectId={projectId} />;
}
