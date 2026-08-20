"use client";

import type { ProjectWithClient } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { ProjectCards } from "./project-cards";
import { ProjectTable } from "./project-table";

export function ProjectListSection({ projects }: { projects: ProjectWithClient[] }) {
  const view = useListViewMode();

  if (view === "cards") return <ProjectCards projects={projects} />;
  return <ProjectTable projects={projects} />;
}
