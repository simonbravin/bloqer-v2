"use client";

import type { ProjectListItem } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { ProjectCards } from "./project-cards";
import { ProjectTable } from "./project-table";

export function ProjectListSection({ projects }: { projects: ProjectListItem[] }) {
  const view = useListViewMode("view", "cards");

  if (view === "cards") return <ProjectCards projects={projects} />;
  return <ProjectTable projects={projects} />;
}
