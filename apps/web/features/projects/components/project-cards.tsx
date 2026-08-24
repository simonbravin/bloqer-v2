import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { ProjectType } from "@bloqer/database";
import type { ProjectListItem } from "@bloqer/services";
import { ProjectStatusBadge } from "./project-status-badge";

const TYPE_LABELS: Record<ProjectType, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
};

interface ProjectCardsProps {
  projects: ProjectListItem[];
}

export function ProjectCards({ projects }: ProjectCardsProps) {
  if (projects.length === 0) {
    return (
      <ListEmptyState
        title="Sin proyectos"
        description="No hay proyectos con los filtros aplicados, o todavía no creaste ninguno."
        action={
          <Button asChild size="sm">
            <Link href="/proyectos/nuevo">Crear proyecto</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/proyectos/${p.id}`}
          className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{p.code}</span>
            <span className="shrink-0">
              <ProjectStatusBadge status={p.status} />
            </span>
          </div>
          <h3 className="mt-2 truncate font-semibold leading-snug" title={p.name}>
            {p.name}
          </h3>
          <p
            className="mt-1 truncate text-sm text-muted-foreground"
            title={p.client.fantasyName ?? p.client.legalName}
          >
            {p.client.fantasyName ?? p.client.legalName}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">{TYPE_LABELS[p.type]}</p>
        </Link>
      ))}
    </div>
  );
}
