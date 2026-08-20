"use client";

import type { TenantMemberListRow } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { TeamMemberCards } from "./team-member-cards";
import { TeamMemberTable } from "./team-member-table";

export function TeamMemberListSection({ members }: { members: TenantMemberListRow[] }) {
  const view = useListViewMode();
  if (view === "cards") return <TeamMemberCards members={members} />;
  return <TeamMemberTable members={members} />;
}
