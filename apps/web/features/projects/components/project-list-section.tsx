"use client";

import { useSearchParams } from "next/navigation";
import type { ProjectWithClient } from "@bloqer/services";
import { ProjectCards } from "./project-cards";
import { ProjectTable } from "./project-table";

export function ProjectListSection({ projects }: { projects: ProjectWithClient[] }) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "cards" ? "cards" : "table";

  if (view === "cards") return <ProjectCards projects={projects} />;
  return <ProjectTable projects={projects} />;
}
