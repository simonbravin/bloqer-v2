"use client";

import type { ProjectListItem } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { ProjectCards } from "./project-cards";
import { ProjectTable } from "./project-table";

export function ProjectListSection({ projects, canCreate }: { projects: ProjectListItem[]; canCreate: boolean }) {
  const view = useListViewMode("view", "cards");

  if (view === "cards") return <ProjectCards projects={projects} canCreate={canCreate} />;
  return <ProjectTable projects={projects} canCreate={canCreate} />;
}
