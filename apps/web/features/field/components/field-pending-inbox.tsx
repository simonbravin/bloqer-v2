import Link from "next/link";
import type { FieldPendingGroup, FieldPendingList, FieldPendingCounts } from "@bloqer/services";
import { FieldPendingCard } from "./field-pending-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fieldPendingEmptyObraCta } from "@/lib/field-pending-empty-cta";

function groupCount(counts: FieldPendingCounts, id: "todos" | FieldPendingGroup): number {
  switch (id) {
    case "todos":
      return counts.total;
    case "compras":
      return (
        counts.purchaseRequests +
        counts.purchaseOrders +
        counts.purchaseOrdersToConfirm +
        counts.purchaseOrdersToReceive
      );
    case "obra":
      return counts.jobsiteLogs;
    case "certificaciones":
      return counts.certifications + counts.subcontractCertifications;
  }
}

const FILTERS: { id: "todos" | FieldPendingGroup; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "compras", label: "Compras" },
  { id: "obra", label: "Obra" },
  { id: "certificaciones", label: "Certificaciones" },
];

type Props = {
  list: FieldPendingList;
  group: FieldPendingGroup | undefined;
  projectId: string | undefined;
  projects: Array<{ id: string; code: string }>;
  lastProjectId?: string | null;
  /** When true, stay on `/proyectos/[id]/pendientes` (no cross-project chips). */
  lockProject?: boolean;
};

export function FieldPendingInbox({
  list,
  group,
  projectId,
  projects,
  lastProjectId = null,
  lockProject = false,
}: Props) {
  const filterHref = (id: (typeof FILTERS)[number]["id"]) => {
    const params = new URLSearchParams();
    if (id !== "todos") params.set("grupo", id);
    if (!lockProject && projectId) params.set("proyecto", projectId);
    const q = params.toString();
    if (lockProject && projectId) {
      return q ? `/proyectos/${projectId}/pendientes?${q}` : `/proyectos/${projectId}/pendientes`;
    }
    return q ? `/pendientes?${q}` : "/pendientes";
  };

  const obraCta = fieldPendingEmptyObraCta({ projectId, projects, lastProjectId });

  return (
    <div className="space-y-3" data-testid="field-pending-inbox" data-query-ms={list.queryMs}>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (group ?? "todos") === filter.id;
          const count = groupCount(list.counts, filter.id);
          return (
            <Button
              key={filter.id}
              variant={active ? "default" : "outline"}
              size="sm"
              className="min-h-11 gap-1.5"
              asChild
            >
              <Link href={filterHref(filter.id)}>
                {filter.label}
                {count > 0 && (
                  <Badge
                    variant={active ? "outline" : "secondary"}
                    className={cn(
                      "ml-0.5 px-1.5 py-0 text-[10px] leading-4",
                      active && "border-primary-foreground/30 text-primary-foreground",
                    )}
                  >
                    {count}
                  </Badge>
                )}
              </Link>
            </Button>
          );
        })}
      </div>

      {!lockProject && projects.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Button variant={!projectId ? "default" : "outline"} size="sm" className="min-h-11" asChild>
            <Link href={group ? `/pendientes?grupo=${group}` : "/pendientes"}>Todas las obras</Link>
          </Button>
          {projects.map((project) => {
            const params = new URLSearchParams();
            if (group) params.set("grupo", group);
            params.set("proyecto", project.id);
            const active = projectId === project.id;
            return (
              <Button
                key={project.id}
                variant={active ? "default" : "outline"}
                size="sm"
                className="min-h-11"
                asChild
              >
                <Link href={`/pendientes?${params.toString()}`}>{project.code}</Link>
              </Button>
            );
          })}
        </div>
      ) : null}

      {list.items.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="font-medium">No tenés acciones pendientes.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button asChild className="min-h-11">
              <Link href={obraCta.href}>{obraCta.label}</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/notificaciones">Ver notificaciones</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {list.items.map((item) => (
            <FieldPendingCard key={`${item.entityType}-${item.entityId}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
