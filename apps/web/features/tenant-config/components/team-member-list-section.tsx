"use client";

import { useSearchParams } from "next/navigation";
import type { TenantMemberListRow } from "@bloqer/services";
import { TeamMemberCards } from "./team-member-cards";
import { TeamMemberTable } from "./team-member-table";

export function TeamMemberListSection({ members }: { members: TenantMemberListRow[] }) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <TeamMemberCards members={members} />;
  return <TeamMemberTable members={members} />;
}
