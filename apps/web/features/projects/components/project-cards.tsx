import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { ProjectType } from "@bloqer/database";
import type { ProjectWithClient } from "@bloqer/services";
import { ProjectStatusBadge } from "./project-status-badge";

const TYPE_LABELS: Record<ProjectType, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
};

interface ProjectCardsProps {
  projects: ProjectWithClient[];
}

export function ProjectCards({ projects }: ProjectCardsProps) {
  if (projects.length === 0) {
    return <ListEmptyState message="No se encontraron proyectos con los filtros aplicados." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/proyectos/${p.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
            <ProjectStatusBadge status={p.status} />
          </div>
          <h3 className="mt-2 line-clamp-2 font-semibold leading-snug">{p.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.client.fantasyName ?? p.client.legalName}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">{TYPE_LABELS[p.type]}</p>
        </Link>
      ))}
    </div>
  );
}
